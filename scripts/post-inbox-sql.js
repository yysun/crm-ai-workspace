#!/usr/bin/env node

/*
 * Upserts accumulated-action checkbox items directly into SQL dbo.Inbox.
 *
 * This script uses the same payload parser as scripts/post-inbox.js, then:
 * 1. marks currently open SQL rows stale when their actionKey is no longer in
 *    the selected team's current local queue;
 * 2. merges current active, done, and same-day removed payload rows by
 *    (TeamId, ActionKey).
 *
 * Live writes require AIW_ENABLE_SQL_INBOX_UPSERT=1. Dry-run still connects to
 * SQL so it can report the rows that would be closed, inserted, or updated.
 * If a local payload points to an account/contact absent from the SQL database,
 * the script clears that nullable FK while preserving the actionKey and trace.
 * Recent change: merges ActionTitle and ActionCategory separately from the full
 * action instruction, and blocks live writes when payload contract warnings exist.
 */

const fs = require('fs');
const path = require('path');

let sql;
try {
  sql = require('mssql');
} catch {
  console.error('Missing dependency: mssql. Run `npm install` from the workspace root.');
  process.exit(1);
}

const { buildPayloadsForFiles, payloadContractWarnings } = require('./post-inbox');

const workspaceRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(workspaceRoot, '.env');
const staleRemovalReason = 'not-present-in-latest-action';

const fieldLimits = {
  status: 32,
  actionTitle: 160,
  actionCategory: 80,
  sourcePath: 1024,
  sourceActionsReportPath: 1024,
  sourceSummaryPath: 1024,
  sourceMarkdownSection: 512,
  insightText: 4000,
  tensionsText: 4000,
  memoryText: 4000,
  removalReason: 64,
  actionKey: 256,
};

function printHelp() {
  console.log(`Usage:
  node scripts/post-inbox-sql.js --date=2026-06-25 --teams=0,6 --dry-run
  node scripts/post-inbox-sql.js --date=2026-06-25 --teams=0,6
  node scripts/post-inbox-sql.js --file=data/0/daily-triage/2026/06/25/actions-2026-06-25.md --dry-run

Options:
  --date YYYY-MM-DD       Daily triage date to import across available team files. Default: today.
  --team ID               Workspace team ID to include. Can be used multiple times.
  --teams A,B             Workspace team IDs to include, comma-separated.
  --file PATH             Specific actions-YYYY-MM-DD.md file to read. Can be used multiple times.
  --include-checked       Include checked checkbox actions as status=done. Default: unchecked only.
  --skip-removed          Do not merge same-day removed actions from removed-actions-YYYY-MM-DD.json.
  --status VALUE          Status for unchecked actions. Default: open.
  --stale-status VALUE    Status for open SQL rows missing from the current queue. Default: superseded.
  --no-cleanup            Merge current payloads without marking stale open SQL rows.
  --dry-run               Report SQL changes without writing.
  --json                  Print JSON result.
  --quiet                 Print compact output.
  -h, --help              Show this help.

Environment:
  SQL_SERVER, SQL_DATABASE, SQL_USER, and SQL_PASSWORD are required.
  AIW_ENABLE_SQL_INBOX_UPSERT=1 is required unless --dry-run is used.
`);
}

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
    }
    return inner;
  }

  const commentIndex = trimmed.indexOf(' #');
  if (commentIndex >= 0) {
    return trimmed.slice(0, commentIndex).trim();
  }

  return trimmed;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const equalsIndex = normalized.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    process.env[key] = parseEnvValue(normalized.slice(equalsIndex + 1));
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envFlag(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function requireWriteEnabled() {
  if (!envFlag('AIW_ENABLE_SQL_INBOX_UPSERT', false)) {
    throw new Error('SQL inbox upsert is disabled. Set AIW_ENABLE_SQL_INBOX_UPSERT=1 to write dbo.Inbox.');
  }
}

function getConnectionConfig() {
  return {
    server: getRequiredEnv('SQL_SERVER'),
    database: getRequiredEnv('SQL_DATABASE'),
    user: getRequiredEnv('SQL_USER'),
    password: getRequiredEnv('SQL_PASSWORD'),
    options: {
      encrypt: envFlag('SQL_ENCRYPT', false),
      trustServerCertificate: envFlag('SQL_TRUST_SERVER_CERTIFICATE', true),
    },
    connectionTimeout: Number(process.env.SQL_CONNECTION_TIMEOUT_MS || 15000),
    requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT_MS || 120000),
  };
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }
}

function validateSimpleStatus(value, label) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} must be a simple status value.`);
  }
}

function dateParts(isoDate) {
  return {
    year: isoDate.slice(0, 4),
    month: isoDate.slice(5, 7),
    day: isoDate.slice(8, 10),
  };
}

function toRelativePath(filePath) {
  return path.relative(workspaceRoot, path.resolve(workspaceRoot, filePath)).split(path.sep).join('/');
}

function workspaceTeamFromActionPath(filePath) {
  const relativePath = toRelativePath(filePath);
  const match = relativePath.match(/^data\/(-?\d+)\/daily-triage\/\d{4}\/\d{2}\/\d{2}\/actions-\d{4}-\d{2}-\d{2}\.md$/);
  if (!match) {
    throw new Error(`Could not infer workspace team from path: ${relativePath}`);
  }
  return Number(match[1]);
}

function sqlTeamIdFromWorkspaceTeam(workspaceTeamId) {
  const teamId = Number(workspaceTeamId);
  return teamId === -1 || teamId === 0 ? 8 : teamId;
}

function defaultFilesForDate(isoDate) {
  const { year, month, day } = dateParts(isoDate);
  const dataRoot = path.join(workspaceRoot, 'data');
  const filePaths = [];

  if (!fs.existsSync(dataRoot)) {
    return filePaths;
  }

  for (const entry of fs.readdirSync(dataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^-?\d+$/.test(entry.name)) {
      continue;
    }

    const candidate = path.join(dataRoot, entry.name, 'daily-triage', year, month, day, `actions-${isoDate}.md`);
    if (fs.existsSync(candidate)) {
      filePaths.push(toRelativePath(candidate));
    }
  }

  return filePaths.sort();
}

function parseIntegerList(value, label) {
  const rawItems = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (rawItems.length === 0) {
    throw new Error(`${label} must include at least one team ID.`);
  }
  return rawItems.map((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed)) {
      throw new Error(`${label} contains a non-integer team ID: ${item}`);
    }
    return parsed;
  });
}

function parseArgs(argv) {
  const args = {
    date: null,
    filePaths: [],
    workspaceTeams: [],
    includeChecked: false,
    skipRemoved: false,
    status: 'open',
    staleStatus: 'superseded',
    noCleanup: false,
    dryRun: false,
    json: false,
    quiet: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === '--help' || part === '-h') {
      args.help = true;
      continue;
    }
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part === '--json') {
      args.json = true;
      continue;
    }
    if (part === '--quiet') {
      args.quiet = true;
      continue;
    }
    if (part === '--include-checked') {
      args.includeChecked = true;
      continue;
    }
    if (part === '--skip-removed') {
      args.skipRemoved = true;
      continue;
    }
    if (part === '--no-cleanup') {
      args.noCleanup = true;
      continue;
    }
    if (part === '--date') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --date.');
      }
      args.date = value;
      index += 1;
      continue;
    }
    if (part.startsWith('--date=')) {
      args.date = part.slice('--date='.length);
      continue;
    }
    if (part === '--file') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --file.');
      }
      args.filePaths.push(value);
      index += 1;
      continue;
    }
    if (part.startsWith('--file=')) {
      args.filePaths.push(part.slice('--file='.length));
      continue;
    }
    if (part === '--team') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --team.');
      }
      args.workspaceTeams.push(...parseIntegerList(value, '--team'));
      index += 1;
      continue;
    }
    if (part.startsWith('--team=')) {
      args.workspaceTeams.push(...parseIntegerList(part.slice('--team='.length), '--team'));
      continue;
    }
    if (part === '--teams') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --teams.');
      }
      args.workspaceTeams.push(...parseIntegerList(value, '--teams'));
      index += 1;
      continue;
    }
    if (part.startsWith('--teams=')) {
      args.workspaceTeams.push(...parseIntegerList(part.slice('--teams='.length), '--teams'));
      continue;
    }
    if (part === '--status') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --status.');
      }
      args.status = value;
      index += 1;
      continue;
    }
    if (part.startsWith('--status=')) {
      args.status = part.slice('--status='.length);
      continue;
    }
    if (part === '--stale-status') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --stale-status.');
      }
      args.staleStatus = value;
      index += 1;
      continue;
    }
    if (part.startsWith('--stale-status=')) {
      args.staleStatus = part.slice('--stale-status='.length);
      continue;
    }
    if (part.startsWith('-')) {
      throw new Error(`Unknown option: ${part}`);
    }
    args.filePaths.push(part);
  }

  args.date = args.date || todayIso();
  validateIsoDate(args.date, '--date');
  validateSimpleStatus(args.status, '--status');
  validateSimpleStatus(args.staleStatus, '--stale-status');
  args.workspaceTeams = [...new Set(args.workspaceTeams)];
  return args;
}

function resolveInputFiles(args) {
  let filePaths = args.filePaths.length > 0 ? args.filePaths : defaultFilesForDate(args.date);
  if (filePaths.length === 0) {
    throw new Error(`No action files found for ${args.date}. Pass --date=YYYY-MM-DD or --file PATH.`);
  }

  const selectedTeams = new Set(args.workspaceTeams);
  if (selectedTeams.size > 0) {
    filePaths = filePaths.filter((filePath) => selectedTeams.has(workspaceTeamFromActionPath(filePath)));
  }

  if (filePaths.length === 0) {
    throw new Error(`No action files matched selected team(s) for ${args.date}.`);
  }
  return filePaths.map(toRelativePath).sort();
}

function truncate(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function requiredText(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`Inbox payload is missing required ${fieldName}.`);
  }
  return text;
}

function optionalInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return Number(value);
}

function sqlDate(value, fieldName, fallback = null) {
  const effective = value || fallback;
  if (!effective) {
    return null;
  }
  validateIsoDate(String(effective).slice(0, 10), fieldName);
  return new Date(`${String(effective).slice(0, 10)}T00:00:00.000Z`);
}

function normalizedPayload(rawPayload, args) {
  const sourceDate = requiredText(rawPayload.sourceDate, 'sourceDate');
  const actionKey = truncate(requiredText(rawPayload.actionKey, 'actionKey'), fieldLimits.actionKey);
  return {
    teamId: Number(rawPayload.teamId),
    accountId: optionalInt(rawPayload.accountId),
    contactId: optionalInt(rawPayload.contactId),
    sourceDate,
    evidenceDate: rawPayload.evidenceDate || null,
    actionTitle: truncate(requiredText(rawPayload.actionTitle, 'actionTitle'), fieldLimits.actionTitle),
    actionCategory: truncate(rawPayload.actionCategory || null, fieldLimits.actionCategory),
    actionText: requiredText(rawPayload.actionText, 'actionText'),
    status: truncate(requiredText(rawPayload.status, 'status'), fieldLimits.status),
    firstSeenDate: rawPayload.firstSeenDate || sourceDate,
    lastSeenDate: rawPayload.lastSeenDate || sourceDate,
    removedDate: rawPayload.removedDate || null,
    removalReason: truncate(rawPayload.removalReason || null, fieldLimits.removalReason),
    sourcePath: truncate(requiredText(rawPayload.sourcePath, 'sourcePath'), fieldLimits.sourcePath),
    sourceActionsReportPath: truncate(rawPayload.sourceActionsReportPath || rawPayload.sourcePath, fieldLimits.sourceActionsReportPath),
    sourceSummaryPath: truncate(rawPayload.sourceSummaryPath || null, fieldLimits.sourceSummaryPath),
    sourceMarkdownSection: truncate(rawPayload.sourceMarkdownSection || '', fieldLimits.sourceMarkdownSection) || '',
    traceMarkdown: rawPayload.traceMarkdown || null,
    insightText: truncate(rawPayload.insightText || null, fieldLimits.insightText),
    tensionsText: truncate(rawPayload.tensionsText || null, fieldLimits.tensionsText),
    memoryText: truncate(rawPayload.memoryText || null, fieldLimits.memoryText),
    actionKey,
    activeQueueItem: rawPayload.status === args.status && !rawPayload.removedDate && !rawPayload.removalReason,
  };
}

function dedupePayloadItems(items, args) {
  const byKey = new Map();
  for (const item of items) {
    const payload = normalizedPayload(item.payload, args);
    byKey.set(`${payload.teamId}\u0000${payload.actionKey}`, {
      inputPath: item.inputPath,
      payload,
    });
  }
  return [...byKey.values()];
}

function payloadKeySets(payloadItems) {
  const activeKeysByTeam = new Map();
  const allKeysByTeam = new Map();
  for (const item of payloadItems) {
    const { teamId, actionKey, activeQueueItem } = item.payload;
    if (!allKeysByTeam.has(teamId)) {
      allKeysByTeam.set(teamId, new Set());
    }
    allKeysByTeam.get(teamId).add(actionKey);

    if (activeQueueItem) {
      if (!activeKeysByTeam.has(teamId)) {
        activeKeysByTeam.set(teamId, new Set());
      }
      activeKeysByTeam.get(teamId).add(actionKey);
    }
  }
  return { activeKeysByTeam, allKeysByTeam };
}

function targetSqlTeamIds(args, filePaths, payloadItems) {
  const teams = new Set();
  if (args.workspaceTeams.length > 0) {
    for (const teamId of args.workspaceTeams) {
      teams.add(sqlTeamIdFromWorkspaceTeam(teamId));
    }
  } else {
    for (const filePath of filePaths) {
      teams.add(sqlTeamIdFromWorkspaceTeam(workspaceTeamFromActionPath(filePath)));
    }
    for (const item of payloadItems) {
      teams.add(item.payload.teamId);
    }
  }
  return [...teams].sort((a, b) => a - b);
}

async function fetchExistingOpenRows(pool, teamIds) {
  if (teamIds.length === 0) {
    return [];
  }

  const request = pool.request();
  request.input('openStatus', sql.NVarChar(32), 'open');
  const placeholders = teamIds.map((teamId, index) => {
    const name = `team${index}`;
    request.input(name, sql.Int, teamId);
    return `@${name}`;
  });

  const result = await request.query(`
    SELECT InboxId, TeamId, ActionKey, Status
    FROM dbo.Inbox
    WHERE Status = @openStatus
      AND TeamId IN (${placeholders.join(', ')})
  `);
  return result.recordset || [];
}

async function fetchExistingRowsByKey(pool, payloadItems) {
  const rows = new Map();
  if (payloadItems.length === 0) {
    return rows;
  }

  const seen = new Set();
  const uniqueItems = payloadItems.filter((item) => {
    const key = `${item.payload.teamId}\u0000${item.payload.actionKey}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  for (let offset = 0; offset < uniqueItems.length; offset += 200) {
    const chunk = uniqueItems.slice(offset, offset + 200);
    const request = pool.request();
    const clauses = [];
    chunk.forEach((item, index) => {
      const teamName = `team${index}`;
      const keyName = `key${index}`;
      request.input(teamName, sql.Int, item.payload.teamId);
      request.input(keyName, sql.NVarChar(fieldLimits.actionKey), item.payload.actionKey);
      clauses.push(`(TeamId = @${teamName} AND ActionKey = @${keyName})`);
    });

    const result = await request.query(`
      SELECT InboxId, TeamId, ActionKey, Status
      FROM dbo.Inbox
      WHERE ${clauses.join(' OR ')}
    `);
    for (const row of result.recordset || []) {
      rows.set(`${row.TeamId}\u0000${row.ActionKey}`, row);
    }
  }

  return rows;
}

async function fetchExistingIds(pool, tableName, ids) {
  const allowedTables = new Set(['Accounts', 'Contacts']);
  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported table for ID validation: ${tableName}`);
  }

  const existing = new Set();
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(Number(id))).map(Number))];
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const chunk = uniqueIds.slice(offset, offset + 200);
    if (chunk.length === 0) {
      continue;
    }

    const request = pool.request();
    const placeholders = chunk.map((id, index) => {
      const name = `id${index}`;
      request.input(name, sql.Int, id);
      return `@${name}`;
    });
    const result = await request.query(`
      SELECT Id
      FROM dbo.${tableName}
      WHERE Id IN (${placeholders.join(', ')})
    `);
    for (const row of result.recordset || []) {
      existing.add(Number(row.Id));
    }
  }
  return existing;
}

async function clearMissingObjectLinks(pool, payloadItems) {
  const accountIds = payloadItems.map((item) => item.payload.accountId).filter(Boolean);
  const contactIds = payloadItems.map((item) => item.payload.contactId).filter(Boolean);
  const existingAccountIds = await fetchExistingIds(pool, 'Accounts', accountIds);
  const existingContactIds = await fetchExistingIds(pool, 'Contacts', contactIds);
  let clearedAccounts = 0;
  let clearedContacts = 0;

  for (const item of payloadItems) {
    const { payload } = item;
    if (payload.accountId && !existingAccountIds.has(Number(payload.accountId))) {
      payload.accountId = null;
      clearedAccounts += 1;
    }
    if (payload.contactId && !existingContactIds.has(Number(payload.contactId))) {
      payload.contactId = null;
      clearedContacts += 1;
    }
  }

  return {
    clearedAccounts,
    clearedContacts,
  };
}

function staleRowsForCleanup(existingOpenRows, activeKeysByTeam, allPayloadKeysByTeam) {
  return existingOpenRows.filter((row) => {
    const activeKeys = activeKeysByTeam.get(row.TeamId) || new Set();
    const allPayloadKeys = allPayloadKeysByTeam.get(row.TeamId) || new Set();
    return !activeKeys.has(row.ActionKey) && !allPayloadKeys.has(row.ActionKey);
  });
}

function bindDate(request, name, value, fieldName, fallback = null) {
  request.input(name, sql.DateTime2, sqlDate(value, fieldName, fallback));
}

function bindPayload(request, payload) {
  request.input('TeamId', sql.Int, payload.teamId);
  request.input('AccountId', sql.Int, payload.accountId);
  request.input('ContactId', sql.Int, payload.contactId);
  bindDate(request, 'SourceDate', payload.sourceDate, 'sourceDate');
  request.input('ActionTitle', sql.NVarChar(fieldLimits.actionTitle), payload.actionTitle);
  request.input('ActionCategory', sql.NVarChar(fieldLimits.actionCategory), payload.actionCategory);
  request.input('ActionText', sql.NVarChar(sql.MAX), payload.actionText);
  request.input('Status', sql.NVarChar(fieldLimits.status), payload.status);
  bindDate(request, 'FirstSeenDate', payload.firstSeenDate, 'firstSeenDate', payload.sourceDate);
  bindDate(request, 'LastSeenDate', payload.lastSeenDate, 'lastSeenDate', payload.sourceDate);
  request.input('SourcePath', sql.NVarChar(fieldLimits.sourcePath), payload.sourcePath);
  request.input('SourceActionsReportPath', sql.NVarChar(fieldLimits.sourceActionsReportPath), payload.sourceActionsReportPath);
  request.input('SourceSummaryPath', sql.NVarChar(fieldLimits.sourceSummaryPath), payload.sourceSummaryPath);
  request.input('SourceMarkdownSection', sql.NVarChar(fieldLimits.sourceMarkdownSection), payload.sourceMarkdownSection);
  request.input('TraceMarkdown', sql.NVarChar(sql.MAX), payload.traceMarkdown);
  request.input('InsightText', sql.NVarChar(fieldLimits.insightText), payload.insightText);
  request.input('TensionsText', sql.NVarChar(fieldLimits.tensionsText), payload.tensionsText);
  request.input('MemoryText', sql.NVarChar(fieldLimits.memoryText), payload.memoryText);
  bindDate(request, 'EvidenceDate', payload.evidenceDate, 'evidenceDate');
  bindDate(request, 'RemovedDate', payload.removedDate, 'removedDate');
  request.input('RemovalReason', sql.NVarChar(fieldLimits.removalReason), payload.removalReason);
  request.input('ActionKey', sql.NVarChar(fieldLimits.actionKey), payload.actionKey);
}

async function markStaleRow(transaction, row, args) {
  const request = new sql.Request(transaction);
  request.input('InboxId', sql.Int, row.InboxId);
  request.input('Status', sql.NVarChar(fieldLimits.status), truncate(args.staleStatus, fieldLimits.status));
  request.input('RemovedDate', sql.DateTime2, sqlDate(args.date, '--date'));
  request.input('RemovalReason', sql.NVarChar(fieldLimits.removalReason), staleRemovalReason);
  request.input('SourceDate', sql.DateTime2, sqlDate(args.date, '--date'));
  const result = await request.query(`
    UPDATE dbo.Inbox
    SET Status = @Status,
        RemovedDate = COALESCE(RemovedDate, @RemovedDate),
        RemovalReason = COALESCE(RemovalReason, @RemovalReason),
        SourceDate = @SourceDate,
        UpdatedAt = SYSUTCDATETIME()
    WHERE InboxId = @InboxId
      AND Status = 'open'
  `);
  return result.rowsAffected[0] || 0;
}

async function mergePayload(transaction, payload) {
  const request = new sql.Request(transaction);
  bindPayload(request, payload);
  const result = await request.query(`
    MERGE dbo.Inbox WITH (HOLDLOCK) AS target
    USING (SELECT @TeamId AS TeamId, @ActionKey AS ActionKey) AS source
      ON target.TeamId = source.TeamId AND target.ActionKey = source.ActionKey
    WHEN MATCHED THEN
      UPDATE SET
        AccountId = @AccountId,
        ContactId = @ContactId,
        SourceDate = @SourceDate,
        ActionTitle = @ActionTitle,
        ActionCategory = @ActionCategory,
        ActionText = @ActionText,
        Status = @Status,
        FirstSeenDate = @FirstSeenDate,
        LastSeenDate = @LastSeenDate,
        SourcePath = @SourcePath,
        SourceActionsReportPath = @SourceActionsReportPath,
        SourceSummaryPath = @SourceSummaryPath,
        SourceMarkdownSection = @SourceMarkdownSection,
        TraceMarkdown = @TraceMarkdown,
        InsightText = @InsightText,
        TensionsText = @TensionsText,
        MemoryText = @MemoryText,
        EvidenceDate = @EvidenceDate,
        RemovedDate = @RemovedDate,
        RemovalReason = @RemovalReason,
        UpdatedAt = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (
        TeamId,
        AccountId,
        ContactId,
        SourceDate,
        ActionTitle,
        ActionCategory,
        ActionText,
        Status,
        FirstSeenDate,
        LastSeenDate,
        SourcePath,
        SourceActionsReportPath,
        SourceSummaryPath,
        SourceMarkdownSection,
        TraceMarkdown,
        InsightText,
        TensionsText,
        MemoryText,
        EvidenceDate,
        RemovedDate,
        RemovalReason,
        ActionKey,
        CreatedAt,
        UpdatedAt
      )
      VALUES (
        @TeamId,
        @AccountId,
        @ContactId,
        @SourceDate,
        @ActionTitle,
        @ActionCategory,
        @ActionText,
        @Status,
        @FirstSeenDate,
        @LastSeenDate,
        @SourcePath,
        @SourceActionsReportPath,
        @SourceSummaryPath,
        @SourceMarkdownSection,
        @TraceMarkdown,
        @InsightText,
        @TensionsText,
        @MemoryText,
        @EvidenceDate,
        @RemovedDate,
        @RemovalReason,
        @ActionKey,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      )
    OUTPUT $action AS MergeAction;
  `);
  return result.recordset && result.recordset[0] ? result.recordset[0].MergeAction : 'UNKNOWN';
}

async function writeChanges(pool, staleRows, payloadItems, args) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let staleClosed = 0;
    if (!args.noCleanup) {
      for (const row of staleRows) {
        staleClosed += await markStaleRow(transaction, row, args);
      }
    }

    let inserted = 0;
    let updated = 0;
    for (const item of payloadItems) {
      const action = await mergePayload(transaction, item.payload);
      if (action === 'INSERT') {
        inserted += 1;
      } else if (action === 'UPDATE') {
        updated += 1;
      }
    }

    await transaction.commit();
    return { staleClosed, inserted, updated };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

function countPayloadStatuses(payloadItems) {
  const counts = {};
  for (const item of payloadItems) {
    counts[item.payload.status] = (counts[item.payload.status] || 0) + 1;
  }
  return counts;
}

function summarizeByTeam(items, field = 'teamId') {
  const counts = {};
  for (const item of items) {
    const key = String(item.payload ? item.payload[field] : item.TeamId);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  loadDotEnv(envFilePath);
  if (!args.dryRun) {
    requireWriteEnabled();
  }

  const filePaths = resolveInputFiles(args);
  const rawPayloadItems = buildPayloadsForFiles({
    filePaths,
    importDate: args.date,
    includeChecked: args.includeChecked,
    skipRemoved: args.skipRemoved,
    status: args.status,
  });
  const payloadItems = dedupePayloadItems(rawPayloadItems, args);
  const contractWarnings = payloadContractWarnings(payloadItems);
  const teamIds = targetSqlTeamIds(args, filePaths, payloadItems);

  if (payloadItems.length === 0 && teamIds.length === 0) {
    throw new Error(`No SQL inbox payloads or target teams found for ${args.date}.`);
  }

  const pool = await sql.connect(getConnectionConfig());
  try {
    const linkCleanup = await clearMissingObjectLinks(pool, payloadItems);
    const existingOpenRows = await fetchExistingOpenRows(pool, teamIds);
    const existingRowsByKey = await fetchExistingRowsByKey(pool, payloadItems);
    const { activeKeysByTeam, allKeysByTeam } = payloadKeySets(payloadItems);
    const staleRows = args.noCleanup
      ? []
      : staleRowsForCleanup(existingOpenRows, activeKeysByTeam, allKeysByTeam);

    const plannedInserts = payloadItems.filter((item) => !existingRowsByKey.has(`${item.payload.teamId}\u0000${item.payload.actionKey}`)).length;
    const plannedUpdates = payloadItems.length - plannedInserts;
    const baseResult = {
      dry_run: args.dryRun,
      date: args.date,
      files: filePaths,
      target_sql_team_ids: teamIds,
      payloads: payloadItems.length,
      contract_warning_count: contractWarnings.length,
      contract_warnings: contractWarnings,
      payload_statuses: countPayloadStatuses(payloadItems),
      payloads_by_team: summarizeByTeam(payloadItems),
      cleared_missing_account_links: linkCleanup.clearedAccounts,
      cleared_missing_contact_links: linkCleanup.clearedContacts,
      existing_open_rows: existingOpenRows.length,
      stale_open_rows_to_close: staleRows.length,
      planned_inserts: plannedInserts,
      planned_updates: plannedUpdates,
      cleanup_enabled: !args.noCleanup,
      stale_status: args.staleStatus,
    };

    if (args.dryRun) {
      if (args.json) {
        console.log(JSON.stringify(baseResult, null, 2));
      } else {
        console.log(`Dry run: SQL Inbox ${args.date}`);
        console.log(`Files: ${filePaths.length}`);
        console.log(`Target SQL teams: ${teamIds.join(', ')}`);
        console.log(`Payloads: ${payloadItems.length} ${JSON.stringify(baseResult.payload_statuses)}`);
        console.log(`Contract warnings: ${contractWarnings.length}`);
        if (!args.quiet && contractWarnings.length > 0) {
          for (const warning of contractWarnings.slice(0, 25)) {
            console.log(`- contract ${warning.inputPath} ${warning.actionKey}: ${warning.warning}`);
          }
          if (contractWarnings.length > 25) {
            console.log(`... ${contractWarnings.length - 25} more contract warnings`);
          }
        }
        console.log(`Cleared missing SQL account links: ${linkCleanup.clearedAccounts}`);
        console.log(`Cleared missing SQL contact links: ${linkCleanup.clearedContacts}`);
        console.log(`Existing open rows in target teams: ${existingOpenRows.length}`);
        console.log(`Stale open rows to mark ${args.staleStatus}: ${staleRows.length}`);
        console.log(`Planned inserts: ${plannedInserts}`);
        console.log(`Planned updates: ${plannedUpdates}`);
        if (!args.quiet && staleRows.length > 0) {
          for (const row of staleRows.slice(0, 25)) {
            console.log(`- stale team:${row.TeamId} inbox:${row.InboxId} ${row.ActionKey}`);
          }
          if (staleRows.length > 25) {
            console.log(`... ${staleRows.length - 25} more stale rows`);
          }
        }
      }
      return;
    }

    if (contractWarnings.length > 0) {
      throw new Error(`SQL Inbox payload contract failed with ${contractWarnings.length} warning(s). Run --dry-run --json to inspect action rows before live writing.`);
    }

    const writeResult = await writeChanges(pool, staleRows, payloadItems, args);
    const result = {
      ...baseResult,
      stale_open_rows_closed: writeResult.staleClosed,
      inserted: writeResult.inserted,
      updated: writeResult.updated,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`SQL Inbox upsert complete for ${args.date}.`);
      console.log(`Closed stale open rows: ${writeResult.staleClosed}`);
      console.log(`Inserted rows: ${writeResult.inserted}`);
      console.log(`Updated rows: ${writeResult.updated}`);
    }
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
