#!/usr/bin/env node

/*
 * Relabels legacy dbo.Inbox removal reasons after the queue labels were split.
 *
 * Existing `not-present-in-latest-action` rows are ambiguous. If the row matches
 * a local removed-actions record, it becomes a source-backed business removal:
 * `replaced-by-new-summary-action`. Otherwise it is SQL cleanup state:
 * `stale-missing-from-current-queue`.
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

const workspaceRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(workspaceRoot, '.env');
const legacyReason = 'not-present-in-latest-action';
const explicitReason = 'replaced-by-new-summary-action';
const staleReason = 'stale-missing-from-current-queue';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    backupPath: null,
  };

  for (const part of argv) {
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part === '--json') {
      args.json = true;
      continue;
    }
    if (part.startsWith('--backup=')) {
      args.backupPath = part.slice('--backup='.length);
      continue;
    }
    if (part === '--help' || part === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${part}`);
  }

  if (!args.backupPath) {
    args.backupPath = defaultBackupPath();
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/relabel-inbox-removal-reasons-sql.js --dry-run --json
  AIW_ENABLE_SQL_INBOX_UPSERT=1 node scripts/relabel-inbox-removal-reasons-sql.js --json

Options:
  --backup=PATH   Backup JSON path. Default: my-work/{today}/inbox-removal-reason-relabel-backup.json
  --dry-run       Report planned updates without writing dbo.Inbox or backup JSON.
  --json          Print JSON result.

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
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t') : inner;
  }

  const commentIndex = trimmed.indexOf(' #');
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
    throw new Error('SQL inbox relabel is disabled. Set AIW_ENABLE_SQL_INBOX_UPSERT=1 to write dbo.Inbox.');
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

function dateParts(isoDate) {
  return {
    year: isoDate.slice(0, 4),
    month: isoDate.slice(5, 7),
    day: isoDate.slice(8, 10),
  };
}

function defaultBackupPath() {
  const { year, month, day } = dateParts(todayIso());
  return path.join('my-work', year, month, day, 'inbox-removal-reason-relabel-backup.json');
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  return text.slice(0, 10);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sqlTeamToWorkspaceTeam(teamId) {
  return Number(teamId) === 8 ? 0 : Number(teamId);
}

function removedFilePath(workspaceTeamId, isoDate) {
  const { year, month, day } = dateParts(isoDate);
  return path.join(workspaceRoot, 'data', String(workspaceTeamId), 'daily-triage', year, month, day, `removed-actions-${isoDate}.json`);
}

function objectKeyFromRemoved(action) {
  return `${action.object_type || ''}:${action.object_id || ''}`;
}

function objectKeyFromRow(row) {
  if (row.AccountId !== null && row.AccountId !== undefined) {
    return `account:${row.AccountId}`;
  }
  if (row.ContactId !== null && row.ContactId !== undefined) {
    return `contact:${row.ContactId}`;
  }
  return '';
}

function addRemovedMatchKeys(keys, sqlTeamId, action) {
  const title = normalizeText(action.action_title || action.action_text);
  const summaryPath = normalizeText(action.latest_summary_path);
  const objectKey = normalizeText(objectKeyFromRemoved(action));

  if (summaryPath && title) {
    keys.add(`${sqlTeamId}|summary|${summaryPath}|${title}`);
  }
  if (objectKey && title) {
    keys.add(`${sqlTeamId}|object|${objectKey}|${title}`);
  }
}

function rowMatchKeys(row) {
  const sqlTeamId = Number(row.TeamId);
  const title = normalizeText(row.ActionTitle || row.ActionText);
  const summaryPath = normalizeText(row.SourceSummaryPath);
  const objectKey = normalizeText(objectKeyFromRow(row));
  const keys = [];

  if (summaryPath && title) {
    keys.push(`${sqlTeamId}|summary|${summaryPath}|${title}`);
  }
  if (objectKey && title) {
    keys.push(`${sqlTeamId}|object|${objectKey}|${title}`);
  }

  return keys;
}

function buildRemovedKeys(rows) {
  const keys = new Set();
  const files = new Map();

  for (const row of rows) {
    const date = normalizeDate(row.SourceDate || row.RemovedDate);
    if (!date) {
      continue;
    }
    const workspaceTeamId = sqlTeamToWorkspaceTeam(row.TeamId);
    files.set(`${workspaceTeamId}|${date}`, removedFilePath(workspaceTeamId, date));
  }

  for (const [fileKey, filePath] of files) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const [workspaceTeamId] = fileKey.split('|');
    const sqlTeamId = Number(workspaceTeamId) === 0 ? 8 : Number(workspaceTeamId);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const action of parsed.removed_actions || []) {
      addRemovedMatchKeys(keys, sqlTeamId, action);
    }
  }

  return keys;
}

function classifyRows(rows) {
  const removedKeys = buildRemovedKeys(rows);
  const explicitIds = [];
  const staleIds = [];
  const perTeam = new Map();

  for (const row of rows) {
    const teamKey = String(row.TeamId);
    if (!perTeam.has(teamKey)) {
      perTeam.set(teamKey, { teamId: Number(row.TeamId), explicitRows: 0, staleRows: 0, totalRows: 0 });
    }
    const team = perTeam.get(teamKey);
    team.totalRows += 1;

    const isExplicit = rowMatchKeys(row).some((key) => removedKeys.has(key));
    if (isExplicit) {
      explicitIds.push(row.InboxId);
      team.explicitRows += 1;
    } else {
      staleIds.push(row.InboxId);
      team.staleRows += 1;
    }
  }

  return {
    explicitIds,
    staleIds,
    perTeam: [...perTeam.values()].sort((a, b) => a.teamId - b.teamId),
  };
}

async function fetchLegacyRows(pool) {
  const result = await pool.request()
    .input('LegacyReason', sql.NVarChar(64), legacyReason)
    .query(`
      SELECT
        InboxId,
        TeamId,
        AccountId,
        ContactId,
        SourceDate,
        RemovedDate,
        ActionTitle,
        ActionText,
        ActionKey,
        Status,
        RemovalReason,
        SourceSummaryPath
      FROM dbo.Inbox
      WHERE Status = 'superseded'
        AND RemovalReason = @LegacyReason
      ORDER BY TeamId, InboxId
    `);
  return result.recordset || [];
}

async function updateReason(transaction, inboxIds, reason) {
  let updated = 0;
  for (const inboxId of inboxIds) {
    const result = await new sql.Request(transaction)
      .input('InboxId', sql.Int, inboxId)
      .input('LegacyReason', sql.NVarChar(64), legacyReason)
      .input('RemovalReason', sql.NVarChar(64), reason)
      .query(`
        UPDATE dbo.Inbox
        SET RemovalReason = @RemovalReason,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InboxId = @InboxId
          AND Status = 'superseded'
          AND RemovalReason = @LegacyReason
      `);
    updated += result.rowsAffected[0] || 0;
  }
  return updated;
}

function writeBackup(filePath, rows, classification) {
  const absolutePath = path.resolve(workspaceRoot, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify({
    generated_at: new Date().toISOString(),
    legacy_reason: legacyReason,
    explicit_reason: explicitReason,
    stale_reason: staleReason,
    row_count: rows.length,
    explicit_count: classification.explicitIds.length,
    stale_count: classification.staleIds.length,
    rows,
  }, null, 2));
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join('/');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadDotEnv(envFilePath);
  if (!args.dryRun) {
    requireWriteEnabled();
  }

  const pool = await sql.connect(getConnectionConfig());
  try {
    const rows = await fetchLegacyRows(pool);
    const classification = classifyRows(rows);
    const result = {
      dryRun: args.dryRun,
      legacyReason,
      explicitReason,
      staleReason,
      matchedRows: rows.length,
      explicitRows: classification.explicitIds.length,
      staleRows: classification.staleIds.length,
      perTeam: classification.perTeam,
      backupPath: args.dryRun ? null : null,
      updatedExplicit: 0,
      updatedStale: 0,
    };

    if (!args.dryRun && rows.length > 0) {
      result.backupPath = writeBackup(args.backupPath, rows, classification);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        result.updatedExplicit = await updateReason(transaction, classification.explicitIds, explicitReason);
        result.updatedStale = await updateReason(transaction, classification.staleIds, staleReason);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Matched ${result.matchedRows} legacy rows.`);
      console.log(`Explicit business removals: ${result.explicitRows}`);
      console.log(`SQL stale cleanup rows: ${result.staleRows}`);
      if (!args.dryRun) {
        console.log(`Updated ${result.updatedExplicit + result.updatedStale} rows.`);
        console.log(`Backup: ${result.backupPath}`);
      }
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
