#!/usr/bin/env node

/**
 * Exports CRM raw data directly from SQL Server into the same data/raw files
 * used by the existing API downloader. Recent change: preserves legacy default
 * team files while using SQL_* settings from .env as the data source.
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
const dataRoot = path.join(workspaceRoot, 'data');
const rawDataRoot = path.join(dataRoot, 'raw');
const envFilePath = path.join(workspaceRoot, '.env');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
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
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object' && !Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDate(value) {
  if (!value) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function compactObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      result[key] = normalizeDate(item);
    }
  }
  return result;
}

function decodeJwtPayload(token) {
  if (!token || !token.includes('.')) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
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

async function query(pool, sqlText) {
  const result = await pool.request().query(sqlText);
  return result.recordset;
}

async function queryUser(pool) {
  const email = process.env.CRM_USER_EMAIL
    || process.env.SQL_CRM_USER_EMAIL
    || decodeJwtPayload(process.env.CRM_ACCESS_TOKEN || '').email
    || decodeJwtPayload(process.env.CRM_ACCESS_TOKEN || '').sub
    || null;

  if (!email) {
    return { user: null, teams: [] };
  }

  const request = pool.request();
  request.input('email', sql.NVarChar, email);
  const result = await request.query(`
    SELECT TOP 1 Id, Name, Email
    FROM dbo.Users
    WHERE Email = @email
    ORDER BY Id

    SELECT ut.TeamId, t.Name, ut.IsDefault
    FROM dbo.UserTeams ut
    LEFT JOIN dbo.Teams t ON t.Id = ut.TeamId
    WHERE ut.UserId = (SELECT TOP 1 Id FROM dbo.Users WHERE Email = @email ORDER BY Id)
    ORDER BY ut.TeamId
  `);

  return {
    user: result.recordsets[0][0] || null,
    teams: result.recordsets[1] || [],
  };
}

async function loadNoteTeamIds(pool) {
  const rows = await query(pool, `
    SELECT EntityId AS noteId, TeamId AS teamId
    FROM dbo.TeamAccess
    WHERE EntityType = 4
    ORDER BY EntityId, TeamId
  `);
  const byNote = new Map();
  for (const row of rows) {
    if (!byNote.has(row.noteId)) {
      byNote.set(row.noteId, []);
    }
    byNote.get(row.noteId).push(row.teamId);
  }
  return byNote;
}

function getTeamIdsText(noteTeamIds, noteId, fallbackTeamId) {
  const teamIds = noteTeamIds.get(noteId) || [];
  if (teamIds.length > 0) {
    return [...new Set(teamIds)].sort((left, right) => left - right).join(',');
  }
  return fallbackTeamId === null || fallbackTeamId === undefined ? '' : String(fallbackTeamId);
}

function buildNote(row, noteTeamIds) {
  const accountData = parseJsonObject(row.accountData);
  const contactData = parseJsonObject(row.contactData);
  const province = contactData.province || accountData.province || row.accountProvince || undefined;
  const contactAccountId = row.ContactAccountId ?? row.accountId ?? null;

  return compactObject({
    Id: row.Id,
    Title: row.Title || undefined,
    Content: row.Content || '',
    Type: row.Type || undefined,
    CreatedBy: row.CreatedBy,
    CreatedAt: row.CreatedAt,
    UpdatedBy: row.UpdatedBy ?? undefined,
    UpdatedAt: row.UpdatedAt,
    accountId: row.accountId ?? undefined,
    accountName: row.accountName || undefined,
    contactName: row.contactName || undefined,
    contactId: row.contactId ?? undefined,
    Province: province,
    author: row.author || undefined,
    TeamIds: getTeamIdsText(noteTeamIds, row.Id, row.TeamId),
    ContactAccountId: contactAccountId,
    TeamId: row.TeamId ?? undefined,
    Flags: row.Flags ?? undefined,
  });
}

async function fetchNotes(pool) {
  const noteTeamIds = await loadNoteTeamIds(pool);
  const rows = await query(pool, `
    SELECT
      n.Id,
      n.Title,
      n.Content,
      noteType.CodeName AS Type,
      n.CreatedBy,
      n.CreatedAt,
      n.UpdatedBy,
      n.UpdatedAt,
      n.TeamId,
      n.Flags,
      na.AccountId AS accountId,
      a.Name AS accountName,
      CAST(NULL AS nvarchar(255)) AS contactName,
      CAST(NULL AS int) AS contactId,
      na.AccountId AS ContactAccountId,
      a.Data AS accountData,
      CAST(NULL AS nvarchar(max)) AS contactData,
      company.Province AS accountProvince,
      u.Name AS author
    FROM dbo.Notes n
    INNER JOIN dbo.NoteAccounts na ON na.NoteId = n.Id
    LEFT JOIN dbo.Accounts a ON a.ID = na.AccountId
    LEFT JOIN dbo.RLPCompanies company ON company.CompanyID = a.RlpCompanyId
    LEFT JOIN dbo.Users u ON u.Id = n.CreatedBy
    LEFT JOIN dbo.CrmCodeTable noteType
      ON noteType.CodeType = 'NoteType'
      AND noteType.CodeValue = n.Type

    UNION ALL

    SELECT
      n.Id,
      n.Title,
      n.Content,
      noteType.CodeName AS Type,
      n.CreatedBy,
      n.CreatedAt,
      n.UpdatedBy,
      n.UpdatedAt,
      n.TeamId,
      n.Flags,
      CAST(NULL AS int) AS accountId,
      a.Name AS accountName,
      c.Name AS contactName,
      c.Id AS contactId,
      c.AccountId AS ContactAccountId,
      a.Data AS accountData,
      c.Data AS contactData,
      company.Province AS accountProvince,
      u.Name AS author
    FROM dbo.Notes n
    INNER JOIN dbo.NoteContacts nc ON nc.NoteID = n.Id
    LEFT JOIN dbo.Contacts c ON c.Id = nc.ContactID
    LEFT JOIN dbo.Accounts a ON a.ID = c.AccountId
    LEFT JOIN dbo.RLPCompanies company ON company.CompanyID = a.RlpCompanyId
    LEFT JOIN dbo.Users u ON u.Id = n.CreatedBy
    LEFT JOIN dbo.CrmCodeTable noteType
      ON noteType.CodeType = 'NoteType'
      AND noteType.CodeValue = n.Type

    UNION ALL

    SELECT
      n.Id,
      n.Title,
      n.Content,
      noteType.CodeName AS Type,
      n.CreatedBy,
      n.CreatedAt,
      n.UpdatedBy,
      n.UpdatedAt,
      n.TeamId,
      n.Flags,
      CAST(NULL AS int) AS accountId,
      CAST(NULL AS nvarchar(255)) AS accountName,
      CAST(NULL AS nvarchar(255)) AS contactName,
      CAST(NULL AS int) AS contactId,
      CAST(NULL AS int) AS ContactAccountId,
      CAST(NULL AS nvarchar(max)) AS accountData,
      CAST(NULL AS nvarchar(max)) AS contactData,
      CAST(NULL AS varchar(128)) AS accountProvince,
      u.Name AS author
    FROM dbo.Notes n
    LEFT JOIN dbo.Users u ON u.Id = n.CreatedBy
    LEFT JOIN dbo.CrmCodeTable noteType
      ON noteType.CodeType = 'NoteType'
      AND noteType.CodeValue = n.Type
    WHERE NOT EXISTS (SELECT 1 FROM dbo.NoteAccounts na WHERE na.NoteId = n.Id)
      AND NOT EXISTS (SELECT 1 FROM dbo.NoteContacts nc WHERE nc.NoteID = n.Id)

    ORDER BY CreatedAt, Id
  `);

  return rows.map((row) => buildNote(row, noteTeamIds));
}

function buildAccount(row, options = {}) {
  return compactObject({
    id: row.id,
    name: row.name,
    data: row.data || '{}',
    teamId: options.includeTeamId ? row.teamId : undefined,
    rlpCompanyId: options.includeRlpIds ? row.rlpCompanyId : undefined,
    noteCount: row.noteCount,
  });
}

async function fetchAccounts(pool) {
  return query(pool, `
    SELECT
      a.ID AS id,
      a.Name AS name,
      a.Data AS data,
      a.TeamId AS teamId,
      a.RlpCompanyId AS rlpCompanyId,
      COUNT(DISTINCT na.NoteId) AS noteCount
    FROM dbo.Accounts a
    LEFT JOIN dbo.NoteAccounts na ON na.AccountId = a.ID
    GROUP BY a.ID, a.Name, a.Data, a.TeamId, a.RlpCompanyId
    ORDER BY a.Name, a.ID
  `);
}

function buildContact(row, options = {}) {
  return compactObject({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName || undefined,
    displayName: row.displayName,
    data: row.data || '{}',
    teamId: options.includeTeamId ? row.teamId : undefined,
    rlpPersonId: options.includeRlpIds ? row.rlpPersonId : undefined,
    rlpCompanyId: options.includeRlpIds ? row.rlpCompanyId : undefined,
    noteCount: row.noteCount,
  });
}

async function fetchContacts(pool) {
  return query(pool, `
    SELECT
      c.Id AS id,
      c.AccountId AS accountId,
      a.Name AS accountName,
      c.Name AS displayName,
      c.Data AS data,
      a.TeamId AS teamId,
      c.RlpPersonId AS rlpPersonId,
      a.RlpCompanyId AS rlpCompanyId,
      COUNT(DISTINCT nc.NoteID) AS noteCount
    FROM dbo.Contacts c
    LEFT JOIN dbo.Accounts a ON a.ID = c.AccountId
    LEFT JOIN dbo.NoteContacts nc ON nc.ContactID = c.Id
    GROUP BY c.Id, c.AccountId, a.Name, c.Name, c.Data, a.TeamId, c.RlpPersonId, a.RlpCompanyId
    ORDER BY c.Name, c.Id
  `);
}

function groupByTeam(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    const key = row.teamId === null || row.teamId === undefined ? '0' : String(row.teamId);
    if (!byTeam.has(key)) {
      byTeam.set(key, []);
    }
    byTeam.get(key).push(row);
  }
  return byTeam;
}

function writeTeamFiles(kind, rows, builder) {
  const results = [];
  const byTeam = groupByTeam(rows);

  for (const [teamId, teamRows] of [...byTeam.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const isDefaultTeam = teamId === '0';
    const outputRows = teamRows.map((row) => builder(row, {
      includeTeamId: !isDefaultTeam,
      includeRlpIds: isDefaultTeam,
    }));
    const outputPath = path.join(rawDataRoot, `${kind}-${teamId}.json`);
    writeJson(outputPath, outputRows);
    results.push({
      kind,
      teamId,
      count: outputRows.length,
      outputPath: path.relative(workspaceRoot, outputPath).split(path.sep).join('/'),
    });

    if (isDefaultTeam) {
      const legacyPath = path.join(rawDataRoot, `${kind}-1.json`);
      writeJson(legacyPath, outputRows);
      results.push({
        kind,
        teamId: '1',
        count: outputRows.length,
        outputPath: path.relative(workspaceRoot, legacyPath).split(path.sep).join('/'),
        legacyDefaultTeamMirror: true,
      });
    }
  }

  return results;
}

async function main() {
  loadDotEnv(envFilePath);

  const pool = await sql.connect(getConnectionConfig());
  try {
    const [{ user, teams }, notes, accounts, contacts] = await Promise.all([
      queryUser(pool),
      fetchNotes(pool),
      fetchAccounts(pool),
      fetchContacts(pool),
    ]);

    const notesPath = path.join(rawDataRoot, 'my-notes.json');
    writeJson(notesPath, notes);

    const accountResults = writeTeamFiles('accounts', accounts, buildAccount);
    const contactResults = writeTeamFiles('contacts', contacts, buildContact);

    console.log(JSON.stringify({
      source: 'sql',
      envFile: fs.existsSync(envFilePath) ? path.relative(workspaceRoot, envFilePath) : null,
      sqlServer: getRequiredEnv('SQL_SERVER'),
      sqlDatabase: getRequiredEnv('SQL_DATABASE'),
      userResolved: Boolean(user),
      userTeamIds: teams.map((team) => team.TeamId),
      results: [
        {
          label: 'notes',
          outputPath: path.relative(workspaceRoot, notesPath).split(path.sep).join('/'),
          count: notes.length,
        },
      ],
      teamResults: [...accountResults, ...contactResults],
    }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
