#!/usr/bin/env node
/*
 * Generates factual source.md snapshots from dated local CRM exports.
 * Semantic helper labels in this file are script-derived evidence/candidates,
 * not downstream franchise judgment. Recent change: brand output now separates
 * Royal LePage name evidence from posture candidates so name absence does not
 * become confirmed non-RLP prospecting posture.
 */

const fs = require('fs');
const path = require('path');
const { normalizeTeamId } = require('./layered-artifact-utils');

const workspaceRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(workspaceRoot, 'data');
const GENERATED_LIMIT_MARKER = 'This file is generated from dated local exports under `data/{teamId}/{yyyy}`, not from same-run raw CRM route responses.';
const LEGACY_GENERATED_LIMIT_MARKERS = [
  'This file is generated from dated local exports under `data/{teamId}/{yyyy}`, not from same-run raw CRM route responses.',
  'This file is generated from dated local exports under `data/2026`, not from same-run raw CRM route responses.',
  'This file is generated from dated local exports under `data/2025`, not from same-run raw CRM route responses.',
];

function getInPlaceSourcePath(jsonFilePath) {
  return jsonFilePath
    .replace(/-data\.json$/, '-source.md')
    .replace(/\.json$/, '-source.md');
}

function parseArgs(argv) {
  const args = {
    team: null,
    year: String(new Date().getFullYear()),
    overwrite: false,
  };

  for (const part of argv) {
    if (part === '--overwrite') {
      args.overwrite = true;
      continue;
    }
    if (part.startsWith('--year=')) {
      args.year = part.slice('--year='.length);
      continue;
    }
    if (part.startsWith('--team=')) {
      args.team = normalizeTeamId(part.slice('--team='.length));
    }
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, content, overwrite) {
  if (fs.existsSync(filePath)) {
    if (!overwrite) {
      return false;
    }

    const existing = fs.readFileSync(filePath, 'utf8');
    if (![GENERATED_LIMIT_MARKER, ...LEGACY_GENERATED_LIMIT_MARKERS].some((marker) => existing.includes(marker))) {
      return false;
    }
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDataBlob(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object') {
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

function flattenText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

function getRecordName(record, objectType, data) {
  if (objectType === 'accounts') {
    return record.name || data.companyName || `Account ${record.id}`;
  }
  return record.displayName || data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || `Contact ${record.id}`;
}

function detectRoyalLePageName(value) {
  return /royal\s+lepage/i.test(String(value || ''));
}

function deriveBrandClassification(record, objectType, data, linkedAccount) {
  const candidates = [
    record.name,
    record.accountName,
    data.companyName,
    linkedAccount && linkedAccount.record && linkedAccount.record.name,
    linkedAccount && linkedAccount.data && linkedAccount.data.companyName,
  ].filter(Boolean);

  if (candidates.some(detectRoyalLePageName)) {
    return {
      evidence: 'Royal LePage name detected',
      postureCandidate: 'Royal LePage / retention context',
    };
  }
  if (candidates.length > 0) {
    return {
      evidence: 'no Royal LePage marker detected',
      postureCandidate: 'non-RLP / needs confirmation',
    };
  }
  return {
    evidence: 'unknown',
    postureCandidate: 'unknown',
  };
}

function deriveTeamObjective(teamId) {
  const normalized = String(teamId || '');
  if (normalized === '0') {
    return 'RLP retention + contact commercial program';
  }
  if (normalized === '6') {
    return 'non-RLP prospecting';
  }
  if (normalized === '7') {
    return 'contact commercial program';
  }
  return 'unknown';
}

function deriveContactRole(data) {
  const roleText = `${data.employeeType || ''} ${data.title || ''} ${data.titleDescription || ''}`.toLowerCase();
  if (roleText.includes('broker owner') || roleText.includes('owner')) {
    return 'owner';
  }
  if (roleText.includes('manager') || roleText.includes('operator')) {
    return 'operator';
  }
  if (roleText.includes('team')) {
    return 'team leader';
  }
  if (roleText.includes('agent') || roleText.includes('sales representative') || roleText.includes('sales rep')) {
    return 'agent';
  }
  if (roleText.includes('office')) {
    return 'office';
  }
  return 'unknown';
}

function deriveCommercialPosture(notes, data) {
  const haystack = flattenText(
    notes.map((note) => `${note.Title || ''} ${note.Content || ''}`).join(' ')
  ).toLowerCase();

  if (haystack.includes('commercial program')) {
    return 'targeted contact/agent';
  }
  if (data.recruitmentSource || data.previousAffiliation || data.futureAffiliation) {
    return 'not indicated';
  }
  return 'not indicated';
}

function isPlaceholderNote(note) {
  const text = flattenText(`${note.Title || ''} ${note.Content || ''}`).toLowerCase();
  if (!text) {
    return true;
  }
  if (text.length <= 3) {
    return true;
  }
  if (['hi', 'a', 'ok', 'test'].includes(text)) {
    return true;
  }
  return text.startsWith('created per request');
}

function deriveStatus(notes) {
  if (notes.length === 0) {
    return 'unknown';
  }

  if (notes.every(isPlaceholderNote)) {
    return 'stale/unclear';
  }

  const haystack = flattenText(notes.map((note) => `${note.Title || ''} ${note.Content || ''}`).join(' ')).toLowerCase();
  if (['rumor', 'rumour', 'heard', 'possibly', 'maybe'].some((snippet) => haystack.includes(snippet))) {
    return 'rumored';
  }
  if (['follow up', 'follow-up', 'request', 'coordinate', 'evaluate', 'meeting', 'discuss', 'review', 'looking forward'].some((snippet) => haystack.includes(snippet))) {
    return 'in progress';
  }
  return 'confirmed';
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Unknown';
  }
  return String(value);
}

function buildAccountSnapshot(context) {
  const { record, data, relatedContacts, brandEvidence, brandPostureCandidate, commercialPosture, noteStatus, teamObjective } = context;
  const lines = [
    `- Primary object: ${formatValue(getRecordName(record, 'accounts', data))}, account ${record.id}.`,
    '- Object role: brokerage.',
    `- Team objective: ${teamObjective}.`,
    `- Brand evidence: ${brandEvidence}.`,
    `- Brand posture candidate: ${brandPostureCandidate}.`,
    `- Commercial program posture: ${commercialPosture}.`,
    '- Scope: brokerage.',
    `- Status: ${noteStatus}.`,
  ];

  const market = [data.city, data.province].filter(Boolean).join(', ');
  const address = data.mailingAddress || data.streetAddress;
  if (market || address) {
    const parts = [];
    if (market) {
      parts.push(market);
    }
    if (address) {
      parts.push(`mailing address \`${address}\``);
    }
    lines.push(`- Market markers: ${parts.join('; ')}.`);
  }

  const scaleBits = [];
  if (data.activeAgentCount !== undefined) {
    scaleBits.push(`${data.activeAgentCount} active agents`);
  }
  if (data.activePayingCount !== undefined) {
    scaleBits.push(`${data.activePayingCount} active paying people`);
  }
  if (data.activeEmployeeCount !== undefined) {
    scaleBits.push(`${data.activeEmployeeCount} active employees`);
  }
  if (data.locationCount !== undefined) {
    scaleBits.push(`${data.locationCount} locations`);
  }
  if (scaleBits.length > 0) {
    lines.push(`- Scale signal: ${scaleBits.join(', ')}.`);
  }

  const tenureBits = [];
  if (data.openDate) {
    tenureBits.push(`open date ${data.openDate}`);
  }
  if (data.contractEndDate) {
    tenureBits.push(`contract end date ${data.contractEndDate}`);
  }
  if (tenureBits.length > 0) {
    lines.push(`- Contract and tenure fields: ${tenureBits.join('; ')}.`);
  }

  if (relatedContacts.length > 0) {
    const label = relatedContacts
      .slice(0, 3)
      .map((contact) => {
        const role = deriveContactRole(contact.data);
        const title = contact.data.title || contact.data.employeeType;
        const roleBits = [role !== 'unknown' ? role : null, title || null].filter(Boolean).join(' with title ');
        return `${contact.name}, contact ${contact.record.id}${roleBits ? `, ${roleBits}` : ''}`;
      })
      .join('; ');
    lines.push(`- Linked contact snapshots on this source date: ${label}.`);
  }

  return lines;
}

function buildContactSnapshot(context) {
  const { record, data, linkedAccount, brandEvidence, brandPostureCandidate, commercialPosture, noteStatus, teamObjective } = context;
  const lines = [
    `- Primary object: ${formatValue(getRecordName(record, 'contacts', data))}, contact ${record.id}.`,
    `- Object role: ${deriveContactRole(data)}.`,
  ];

  if (linkedAccount) {
    lines.push(`- Linked account: ${linkedAccount.name}, account ${linkedAccount.record.id}.`);
  }

  lines.push(`- Team objective: ${teamObjective}.`);
  lines.push(`- Brand evidence: ${brandEvidence}.`);
  lines.push(`- Brand posture candidate: ${brandPostureCandidate}.`);
  lines.push(`- Commercial program posture: ${commercialPosture}.`);
  lines.push('- Scope: isolated.');
  lines.push(`- Status: ${noteStatus}.`);

  if (data.province) {
    lines.push(`- Province: ${data.province}.`);
  }
  if (data.title) {
    lines.push(`- Title: ${data.title}.`);
  }
  if (data.employeeType) {
    lines.push(`- Employee type: ${data.employeeType}.`);
  }
  if (data.startDateWithRLP || data.originalRLPStartDate) {
    lines.push(`- Start date with RLP: ${data.startDateWithRLP || data.originalRLPStartDate}.`);
  }
  if (data.isActive !== undefined) {
    lines.push(`- Current active flag: \`isActive: ${data.isActive}\`.`);
  }
  if (data.futureAffiliation) {
    lines.push(`- Future affiliation: ${data.futureAffiliation}.`);
  }
  if (data.previousAffiliation) {
    lines.push(`- Previous affiliation: ${data.previousAffiliation}.`);
  }
  if (data.recruitmentSource) {
    lines.push(`- Recruitment source: ${data.recruitmentSource}.`);
  }

  return lines;
}

function buildFranchiseFacts(context) {
  const { record, objectType, data, notes, linkedAccount, brandEvidence, brandPostureCandidate, teamId, teamObjective } = context;
  const lines = [];

  if (teamObjective !== 'unknown') {
    if (String(teamId) === '0') {
      lines.push('- Workspace team 0 sets the distillation objective to Royal LePage retention, with contact commercial-program opportunity added only when supported.');
    } else if (String(teamId) === '6') {
      lines.push('- Workspace team 6 sets the distillation objective to non-Royal-LePage prospecting.');
    } else if (String(teamId) === '7') {
      lines.push('- Workspace team 7 sets the distillation objective to contact commercial-program targeting.');
    }
  }

  if (brandEvidence === 'Royal LePage name detected') {
    lines.push(
      objectType === 'accounts'
        ? `- ${getRecordName(record, objectType, data)} has a Royal LePage name marker in this dated export; use ${brandPostureCandidate} as a source-derived candidate inside the team objective.`
        : `- ${getRecordName(record, objectType, data)} is linked to an account with a Royal LePage name marker in this dated export; use ${brandPostureCandidate} as a source-derived candidate inside the team objective.`
    );
  } else if (brandEvidence === 'no Royal LePage marker detected') {
    lines.push(
      objectType === 'accounts'
        ? `- ${getRecordName(record, objectType, data)} has no Royal LePage name marker in the dated export; treat non-RLP posture as a candidate that needs confirmation from the broader source layer.`
        : `- ${getRecordName(record, objectType, data)} is linked to an account with no Royal LePage name marker in the dated export; treat non-RLP posture as a candidate that needs confirmation from the broader source layer.`
    );
  }

  if (objectType === 'accounts' && data.contractEndDate) {
    lines.push(`- The account snapshot includes contract end date ${data.contractEndDate}.`);
  }

  if (objectType === 'accounts' && data.activeAgentCount !== undefined) {
    lines.push(`- The account snapshot reports ${data.activeAgentCount} active agents on the source date export.`);
  }

  if (objectType === 'contacts' && linkedAccount) {
    lines.push(`- The contact snapshot ties ${getRecordName(record, objectType, data)} to ${linkedAccount.name}, account ${linkedAccount.record.id}.`);
  }

  if (objectType === 'contacts' && data.futureAffiliation) {
    lines.push(`- The contact snapshot names future affiliation ${data.futureAffiliation}.`);
  }

  if (objectType === 'contacts' && data.isActive !== undefined) {
    lines.push(`- The contact snapshot marks current active flag as ${data.isActive}.`);
  }

  if (notes.length > 0) {
    lines.push(`- The source-date bucket contains ${notes.length} note${notes.length === 1 ? '' : 's'} linked directly to this ${objectType === 'accounts' ? 'account' : 'contact'}.`);
  }

  if (lines.length === 0) {
    lines.push('- The dated export provides only limited franchise context for this object, so downstream judgment will depend on what later evidence adds.');
  }

  return lines;
}

function summarizeNote(note) {
  const text = flattenText(note.Content || note.Title || '');
  if (!text) {
    return 'contains no usable summary text in the dated export';
  }
  return truncate(text, 220);
}

function getNoteIdentityKey(entry) {
  const note = entry.note || entry;
  const noteId = normalizeId(note.Id);
  if (noteId !== null) {
    return `id:${noteId}`;
  }
  if (entry.filePath) {
    return `file:${entry.filePath}`;
  }
  return `content:${flattenText(`${note.Title || ''} ${note.Content || ''}`)}`;
}

function getNoteContentKey(note) {
  return [
    flattenText(note.Title || '').toLowerCase(),
    flattenText(note.Content || '').toLowerCase(),
    flattenText(note.Type || '').toLowerCase(),
    flattenText(note.author || '').toLowerCase(),
    flattenText((note.CreatedAt || '').slice(0, 10)).toLowerCase(),
  ].join('|');
}

function dedupeNoteEntries(entries) {
  return uniqueBy(entries, (entry) => getNoteIdentityKey(entry));
}

function dedupeNotesForOutput(notes) {
  return uniqueBy(notes, (note) => getNoteContentKey(note));
}

function buildEvidenceInventory(context) {
  const { objectFile, relatedFiles, notes, objectType, record, data } = context;
  const lines = [];
  const objectLabel = objectType === 'accounts' ? 'account snapshot' : 'contact snapshot';
  const uniqueNotes = dedupeNotesForOutput(notes);

  lines.push(`- Daily ${objectLabel} ${toPosixRelative(objectFile)} says ${getRecordName(record, objectType, data)} is recorded as ${objectType === 'accounts' ? `account ${record.id}` : `contact ${record.id}`}.`);

  for (const filePath of relatedFiles.slice(0, 5)) {
    lines.push(`- Related dated evidence file: ${toPosixRelative(filePath)}.`);
  }

  for (const note of uniqueNotes.slice(0, 8)) {
    const author = note.author ? `, author ${note.author}` : '';
    const type = note.Type ? `, type ${note.Type}` : '';
    lines.push(`- Note ${note.Id} from ${(note.CreatedAt || '').slice(0, 10) || 'unknown date'}${type}${author} says ${summarizeNote(note)}.`);
  }

  if (uniqueNotes.length > 8) {
    lines.push(`- ${uniqueNotes.length - 8} additional note${uniqueNotes.length - 8 === 1 ? '' : 's'} exist in the same dated bucket and are listed in source_files.`);
  }

  return lines;
}

function buildKeyUnknowns(context) {
  const { objectType, data, notes, linkedAccount } = context;
  const unknowns = [];

  if (objectType === 'accounts') {
    if (!data.contractEndDate) {
      unknowns.push('- Contract end date is unknown from the dated export.');
    }
    if (!notes.some((note) => normalizeId(note.contactId) !== null)) {
      unknowns.push('- The dated export does not identify a decision-maker or operating contact tied to these notes.');
    }
    unknowns.push('- Whether older or later notes outside this source-date bucket materially change the franchise picture is unknown from this export alone.');
  } else {
    if (!linkedAccount) {
      unknowns.push('- The linked brokerage context is unknown from the dated export.');
    }
    if (!data.futureAffiliation) {
      unknowns.push('- Future affiliation is unknown from the dated export.');
    }
    if (!data.recruitmentSource) {
      unknowns.push('- Recruitment source or commercial-program posture is unknown from the dated export.');
    }
    unknowns.push('- Whether account-level context outside this source-date bucket changes this contact read is unknown from this export alone.');
  }

  return [...new Set(unknowns)];
}

function buildLimits(objectType, notes) {
  return [
    `- ${GENERATED_LIMIT_MARKER}`,
    `- Only note-linked ${objectType === 'accounts' ? 'account' : 'contact'} context present in the dated bucket was used here.`,
    '- The daily export does not preserve full route traceability, pagination context, or surrounding object history outside the source date.',
    notes.length === 0
      ? '- No direct note text was available for this object in the dated bucket.'
      : '- Note text may capture only a slice of the broader relationship history.'
  ];
}

function buildFrontmatter(context) {
  const { objectType, record, createdAt, sourceDate, sourceFiles, teamId } = context;
  const lines = [
    '---',
    `team_id: ${teamId}`,
    `object_type: ${objectType}`,
    `object_id: ${record.id}`,
    'layer: source',
    `created_at: ${createdAt}`,
    `updated_at: ${createdAt}`,
    'ttl: none',
    'expires_at: none',
    'status: active',
    `source_date: ${sourceDate}`,
    'source_files:',
    ...sourceFiles.map((filePath) => `  - ${toPosixRelative(filePath)}`),
    '---',
    '',
  ];
  return lines;
}

function buildSourcesMarkdown(context) {
  const frontmatter = buildFrontmatter(context);
  const snapshot = context.objectType === 'accounts'
    ? buildAccountSnapshot(context)
    : buildContactSnapshot(context);

  const lines = [
    ...frontmatter,
    '## Object Snapshot',
    '',
    ...snapshot,
    '',
    '## Franchise Facts',
    '',
    ...buildFranchiseFacts(context),
    '',
    '## Evidence Inventory',
    '',
    ...buildEvidenceInventory(context),
    '',
    '## Key Unknowns',
    '',
    ...buildKeyUnknowns(context),
    '',
    '## Limits',
    '',
    ...buildLimits(context.objectType, context.notes),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function listDataJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath).sort();
  const result = [];

  for (const name of entries) {
    const entryPath = path.join(dirPath, name);
    const stats = fs.statSync(entryPath);
    if (stats.isDirectory()) {
      result.push(...listDataJsonFiles(entryPath));
      continue;
    }
    if (name.endsWith('-data.json')) {
      result.push(entryPath);
    }
  }

  return result;
}

function collectDayDirs(yearRoot) {
  const dayDirs = [];
  if (!fs.existsSync(yearRoot)) {
    return dayDirs;
  }

  for (const monthName of fs.readdirSync(yearRoot).sort()) {
    const monthPath = path.join(yearRoot, monthName);
    if (!fs.statSync(monthPath).isDirectory()) {
      continue;
    }
    for (const dayName of fs.readdirSync(monthPath).sort()) {
      const dayPath = path.join(monthPath, dayName);
      if (!fs.statSync(dayPath).isDirectory()) {
        continue;
      }
      dayDirs.push({ monthName, dayName, dayPath });
    }
  }

  return dayDirs;
}

function isTeamRootName(value) {
  const text = String(value || '');
  return /^\d+$/.test(text) && !/^\d{4}$/.test(text);
}

function collectTeamYearRoots(args) {
  if (args.team) {
    return [{
      teamId: args.team,
      yearRoot: path.join(dataRoot, args.team, args.year),
    }];
  }

  if (!fs.existsSync(dataRoot)) {
    return [];
  }

  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isTeamRootName(entry.name))
    .map((entry) => ({
      teamId: entry.name,
      yearRoot: path.join(dataRoot, entry.name, args.year),
    }))
    .filter((entry) => fs.existsSync(entry.yearRoot))
    .sort((left, right) => left.teamId.localeCompare(right.teamId));
}

function buildDayState(dayPath) {
  const accountFiles = listDataJsonFiles(path.join(dayPath, 'accounts'));
  const contactFiles = listDataJsonFiles(path.join(dayPath, 'contacts'));
  const noteFiles = listDataJsonFiles(path.join(dayPath, 'notes'));

  const accounts = new Map();
  const contacts = new Map();
  const notes = noteFiles.map((filePath) => ({ filePath, note: readJson(filePath) }));

  for (const filePath of accountFiles) {
    const record = readJson(filePath);
    const id = normalizeId(record.id);
    if (id === null) {
      continue;
    }
    accounts.set(id, {
      filePath,
      record,
      data: parseDataBlob(record.data),
      name: getRecordName(record, 'accounts', parseDataBlob(record.data)),
    });
  }

  for (const filePath of contactFiles) {
    const record = readJson(filePath);
    const id = normalizeId(record.id);
    if (id === null) {
      continue;
    }
    const data = parseDataBlob(record.data);
    contacts.set(id, {
      filePath,
      record,
      data,
      name: getRecordName(record, 'contacts', data),
    });
  }

  const notesByAccountId = new Map();
  const notesByContactId = new Map();

  for (const entry of notes) {
    const note = entry.note;
    const accountIds = uniqueBy([note.ContactAccountId, note.accountId], (value) => String(normalizeId(value)));

    for (const rawId of accountIds) {
      const accountId = normalizeId(rawId);
      if (accountId === null) {
        continue;
      }
      if (!notesByAccountId.has(accountId)) {
        notesByAccountId.set(accountId, []);
      }
      notesByAccountId.get(accountId).push(entry);
    }

    const contactId = normalizeId(note.contactId);
    if (contactId !== null) {
      if (!notesByContactId.has(contactId)) {
        notesByContactId.set(contactId, []);
      }
      notesByContactId.get(contactId).push(entry);
    }
  }

  return {
    accounts,
    contacts,
    notesByAccountId,
    notesByContactId,
  };
}

function buildAccountContext(dayInfo, accountEntry, dayState, options) {
  const relatedContacts = [...dayState.contacts.values()]
    .filter((contact) => normalizeId(contact.record.accountId) === accountEntry.record.id)
    .sort((left, right) => left.record.id - right.record.id);
  const noteEntries = dedupeNoteEntries((dayState.notesByAccountId.get(accountEntry.record.id) || [])
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.note.CreatedAt || 0).getTime();
      const rightTime = new Date(right.note.CreatedAt || 0).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return Number(left.note.Id || 0) - Number(right.note.Id || 0);
    }));
  const notes = dedupeNotesForOutput(noteEntries.map((entry) => entry.note));
  const sourceFiles = uniqueBy([
    accountEntry.filePath,
    ...relatedContacts.map((contact) => contact.filePath),
    ...noteEntries.map((entry) => entry.filePath),
  ], (filePath) => filePath);
  const noteStatus = deriveStatus(notes);
  const brandClassification = deriveBrandClassification(accountEntry.record, 'accounts', accountEntry.data, null);

  return {
    teamId: options.teamId,
    objectType: 'accounts',
    record: accountEntry.record,
    data: accountEntry.data,
    objectFile: accountEntry.filePath,
    relatedFiles: relatedContacts.map((contact) => contact.filePath),
    notes,
    relatedContacts,
    linkedAccount: null,
    brandEvidence: brandClassification.evidence,
    brandPostureCandidate: brandClassification.postureCandidate,
    commercialPosture: deriveCommercialPosture(notes, accountEntry.data),
    teamObjective: deriveTeamObjective(options.teamId),
    noteStatus,
    createdAt: options.createdAt,
    sourceDate: `${options.year}-${dayInfo.monthName}-${dayInfo.dayName}`,
    sourceFiles,
  };
}

function buildContactContext(dayInfo, contactEntry, dayState, options) {
  const linkedAccount = dayState.accounts.get(normalizeId(contactEntry.record.accountId)) || null;
  const noteEntries = dedupeNoteEntries((dayState.notesByContactId.get(contactEntry.record.id) || [])
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.note.CreatedAt || 0).getTime();
      const rightTime = new Date(right.note.CreatedAt || 0).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return Number(left.note.Id || 0) - Number(right.note.Id || 0);
    }));
  const notes = dedupeNotesForOutput(noteEntries.map((entry) => entry.note));
  const sourceFiles = uniqueBy([
    contactEntry.filePath,
    ...(linkedAccount ? [linkedAccount.filePath] : []),
    ...noteEntries.map((entry) => entry.filePath),
  ], (filePath) => filePath);
  const noteStatus = deriveStatus(notes);
  const brandClassification = deriveBrandClassification(contactEntry.record, 'contacts', contactEntry.data, linkedAccount);

  return {
    teamId: options.teamId,
    objectType: 'contacts',
    record: contactEntry.record,
    data: contactEntry.data,
    objectFile: contactEntry.filePath,
    relatedFiles: linkedAccount ? [linkedAccount.filePath] : [],
    notes,
    relatedContacts: [],
    linkedAccount,
    brandEvidence: brandClassification.evidence,
    brandPostureCandidate: brandClassification.postureCandidate,
    commercialPosture: deriveCommercialPosture(notes, contactEntry.data),
    teamObjective: deriveTeamObjective(options.teamId),
    noteStatus,
    createdAt: options.createdAt,
    sourceDate: `${options.year}-${dayInfo.monthName}-${dayInfo.dayName}`,
    sourceFiles,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const teamYearRoots = collectTeamYearRoots(args);

  if (teamYearRoots.length === 0) {
    const scopedRoot = args.team ? path.join(dataRoot, args.team, args.year) : path.join(dataRoot, '{teamId}', args.year);
    throw new Error(`Team year folder not found: ${scopedRoot}`);
  }

  const createdAt = new Date().toISOString();

  const summary = {
    team: args.team,
    year: args.year,
    overwrite: args.overwrite,
    teamYearRoots: teamYearRoots.length,
    dayBuckets: 0,
    inPlaceSourcesWritten: 0,
    inPlaceSourcesSkipped: 0,
    accountObjectsSeen: 0,
    contactObjectsSeen: 0,
  };

  for (const { teamId, yearRoot } of teamYearRoots) {
    const options = {
      teamId,
      year: args.year,
      createdAt,
    };
    const dayDirs = collectDayDirs(yearRoot);

    for (const dayInfo of dayDirs) {
      const dayState = buildDayState(dayInfo.dayPath);
      summary.dayBuckets += 1;

      for (const accountEntry of dayState.accounts.values()) {
        summary.accountObjectsSeen += 1;
        const context = buildAccountContext(dayInfo, accountEntry, dayState, options);
        const destination = getInPlaceSourcePath(accountEntry.filePath);
        const content = buildSourcesMarkdown(context);
        const wrote = writeText(destination, content, args.overwrite);
        if (wrote) {
          summary.inPlaceSourcesWritten += 1;
        } else {
          summary.inPlaceSourcesSkipped += 1;
        }
      }

      for (const contactEntry of dayState.contacts.values()) {
        summary.contactObjectsSeen += 1;
        const context = buildContactContext(dayInfo, contactEntry, dayState, options);
        const destination = getInPlaceSourcePath(contactEntry.filePath);
        const content = buildSourcesMarkdown(context);
        const wrote = writeText(destination, content, args.overwrite);
        if (wrote) {
          summary.inPlaceSourcesWritten += 1;
        } else {
          summary.inPlaceSourcesSkipped += 1;
        }
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
