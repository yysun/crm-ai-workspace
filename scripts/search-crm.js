#!/usr/bin/env node

/*
 * Features: performs documented read-only CRM account/contact lookup and related
 * note inspection when live API access is explicitly enabled.
 * Implementation notes: the helper is gated by AIW_ENABLE_CRM_API so ordinary
 * workspace lookup stays local through scripts/search-index.js.
 * Recent changes: added a hard API-enable flag before CRM credentials are read or
 * network calls are made.
 */

const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(workspaceRoot, '.env');

const validTypes = new Set(['contacts', 'accounts', 'notes']);
const searchTypes = new Set(['contacts', 'accounts']);

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

function requireCrmApiEnabled() {
  const value = String(process.env.AIW_ENABLE_CRM_API || '').trim().toLowerCase();
  if (value !== '1' && value !== 'true' && value !== 'yes') {
    throw new Error('CRM API lookup is disabled. Set AIW_ENABLE_CRM_API=1 to allow documented read-only CRM lookup.');
  }
}

function normalizeType(value) {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'contact') {
    return 'contacts';
  }
  if (normalized === 'account') {
    return 'accounts';
  }
  return normalized;
}

function parseArgs(argv) {
  const args = {
    queryParts: [],
    types: ['contacts', 'accounts'],
    limit: 20,
    json: false,
    includeNotes: false,
    notesOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];

    if (part === '--help' || part === '-h') {
      args.help = true;
      continue;
    }

    if (part === '--json') {
      args.json = true;
      continue;
    }

    if (part === '--include-notes' || part === '--notes') {
      args.includeNotes = true;
      continue;
    }

    if (part === '--notes-only') {
      args.includeNotes = true;
      args.notesOnly = true;
      continue;
    }

    if (part === '--type' || part === '-t') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --type.');
      }
      args.types = parseTypes(value);
      index += 1;
      continue;
    }

    if (part.startsWith('--type=')) {
      args.types = parseTypes(part.slice('--type='.length));
      continue;
    }

    if (part === '--limit') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --limit.');
      }
      args.limit = parseLimit(value);
      index += 1;
      continue;
    }

    if (part.startsWith('--limit=')) {
      args.limit = parseLimit(part.slice('--limit='.length));
      continue;
    }

    if (part.startsWith('-')) {
      throw new Error(`Unknown option: ${part}`);
    }

    args.queryParts.push(part);
  }

  args.query = args.queryParts.join(' ').trim();
  if (args.types.includes('notes')) {
    args.includeNotes = true;
  }
  return args;
}

function parseTypes(value) {
  const types = value.split(',').map(normalizeType).filter(Boolean);
  for (const type of types) {
    if (!validTypes.has(type)) {
      throw new Error(`Invalid --type value "${type}". Use contacts, accounts, notes, or a comma-separated mix.`);
    }
  }
  return [...new Set(types)];
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer.');
  }
  return limit;
}

function printHelp() {
  console.log(`Usage:
  node scripts/search-crm.js "Jazz Gill"
  node scripts/search-crm.js --type=contacts "Jazz Gill"
  node scripts/search-crm.js --type=accounts --json "Royal LePage"
  node scripts/search-crm.js --include-notes "Jazz Gill"
  node scripts/search-crm.js --notes-only "Jazz Gill"

Options:
  -t, --type       contacts, accounts, notes, contact, account, or comma-separated values
  --include-notes  Fetch notes for matched contact/account results
  --notes          Alias for --include-notes
  --notes-only     Print only related notes from matched contacts/accounts
  --limit       Number of summarized results per type. Default: 20
  --json        Print the full API payload instead of a compact summary

Environment:
  AIW_ENABLE_CRM_API=1 must be set to allow documented read-only CRM API calls.
`);
}

function buildUrl(baseUrl, routePath, queryParams = {}) {
  const url = new URL(routePath.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`);
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function getSearchRoute(type) {
  if (type === 'contacts') {
    return '/api/data/contacts/searchAll';
  }

  if (type === 'accounts') {
    return '/api/data/accounts/search';
  }

  throw new Error(`No search route is configured for type: ${type}`);
}

function getNotesRoute(type, id) {
  if (type === 'contacts') {
    return `/api/data/contacts/${encodeURIComponent(id)}/notes`;
  }

  if (type === 'accounts') {
    return `/api/data/accounts/${encodeURIComponent(id)}/notes`;
  }

  throw new Error(`No notes route is configured for type: ${type}`);
}

async function fetchJson(baseUrl, token, routePath, label, queryParams = {}) {
  const url = buildUrl(baseUrl, routePath, queryParams);
  const authorization = /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchSearchResults(baseUrl, token, type, query) {
  return fetchJson(baseUrl, token, getSearchRoute(type), `${type} search`, { q: query });
}

async function fetchRelatedNotes(baseUrl, token, result) {
  const id = getItemId(result);
  const type = getResultType(result);
  if (!id || !searchTypes.has(type)) {
    return [];
  }

  const payload = await fetchJson(baseUrl, token, getNotesRoute(type, id), `${type} ${id} notes`);
  return extractList(payload).map((note) => ({
    ...note,
    relatedType: type,
    relatedId: id,
    relatedName: getItemName(result),
  }));
}

function extractList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  for (const key of ['data', 'results', 'items', 'rows']) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function parseNestedData(item) {
  if (!item || typeof item !== 'object') {
    return {};
  }

  if (item.data && typeof item.data === 'object') {
    return item.data;
  }

  if (typeof item.data === 'string') {
    try {
      return JSON.parse(item.data);
    } catch {
      return {};
    }
  }

  return {};
}

function getResultType(item) {
  const rawType = item && typeof item === 'object' ? String(item.type || '').toLowerCase() : '';
  if (rawType === 'contact' || item.ContactID !== undefined) {
    return 'contacts';
  }
  if (rawType === 'account' || item.AccountID !== undefined) {
    return 'accounts';
  }
  return 'unknown';
}

function getItemId(item) {
  const data = parseNestedData(item);
  return firstValue(
    item && item.id,
    item && item.ContactID,
    item && item.AccountID,
    item && item.objectID,
    item && item.objectId,
    item && item.personID,
    data.personID,
    data.rlpPersonId,
    data.companyID,
    data.brokerageID
  );
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function summarizeItem(item) {
  const data = parseNestedData(item);
  return {
    id: getItemId(item),
    name: firstValue(item.displayName, item.name, data.displayName, data.name, data.companyName, data['company Name'], data.brokerage),
    accountName: firstValue(item.accountName, data.accountName, data.companyName, data.brokerage),
    title: firstValue(data.title, data.titleDescription, data.employeeType, item.title),
    status: firstValue(item.status, data.status),
    city: firstValue(data.city, item.city),
    province: firstValue(data.province, item.province),
  };
}

function summarizeNote(note) {
  return {
    id: firstValue(note.id, note.NoteID, note.noteID, note.NoteId),
    createdAt: firstValue(note.CreatedAt, note.createdAt, note.date, note.Date),
    updatedAt: firstValue(note.UpdatedAt, note.updatedAt),
    accountName: firstValue(note.accountName, note.AccountName),
    contactName: firstValue(note.contactName, note.ContactName),
    title: String(firstValue(note.Title, note.title) || '').replace(/\s+/g, ' ').trim(),
    content: String(firstValue(note.Content, note.content) || '').replace(/\s+/g, ' ').trim(),
    relatedType: note.relatedType,
    relatedId: note.relatedId,
    relatedName: note.relatedName,
  };
}

function getItemName(item) {
  const data = parseNestedData(item);
  return firstValue(item.name, item.displayName, data.displayName, data.name, data.companyName, data['company Name'], data.brokerage) || '';
}

function relevanceScore(item, query) {
  const normalizedQuery = normalizeText(query);
  const normalizedName = normalizeText(getItemName(item));
  const matchCount = Number(item.matchCount || 0);

  if (normalizedName === normalizedQuery) {
    return 1_000_000 + matchCount;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 100_000 + matchCount;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 10_000 + matchCount;
  }

  return matchCount;
}

function sortResults(list, query) {
  return [...list].sort((left, right) => {
    const scoreDifference = relevanceScore(right, query) - relevanceScore(left, query);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return getItemName(left).localeCompare(getItemName(right));
  });
}

function filterResults(list, types) {
  const wanted = new Set(types.filter((type) => type !== 'notes'));
  return list.filter((item) => wanted.has(getResultType(item)));
}

function groupByResultType(list) {
  const groups = new Map();
  for (const item of list) {
    const type = getResultType(item);
    const key = type === 'unknown' ? 'other' : type;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  return groups;
}

function printNoteSummary(notes, limit) {
  console.log(`\nnotes: ${notes.length} result${notes.length === 1 ? '' : 's'}`);

  for (const [index, note] of notes.slice(0, limit).entries()) {
    const summary = summarizeNote(note);
    const parts = [
      summary.id ? `id=${summary.id}` : null,
      summary.createdAt ? `date=${summary.createdAt}` : null,
      summary.relatedName ? `related=${summary.relatedName}` : null,
      summary.accountName ? `account=${summary.accountName}` : null,
      summary.contactName ? `contact=${summary.contactName}` : null,
    ].filter(Boolean);

    console.log(`${index + 1}. ${parts.join(' | ')}`);
    if (summary.title) {
      console.log(`   title: ${summary.title}`);
    }
    if (summary.content) {
      console.log(`   content: ${summary.content.slice(0, 500)}${summary.content.length > 500 ? '...' : ''}`);
    }
  }

  if (notes.length > limit) {
    console.log(`... ${notes.length - limit} more result${notes.length - limit === 1 ? '' : 's'} not shown`);
  }
}

function printSummary(list, types, limit, query, notes = []) {
  const filtered = filterResults(list, types);
  const groups = groupByResultType(filtered);

  for (const type of types) {
    if (type === 'notes') {
      continue;
    }

    const group = sortResults(groups.get(type) || [], query);
    console.log(`\n${type}: ${group.length} result${group.length === 1 ? '' : 's'}`);

    for (const [index, item] of group.slice(0, limit).entries()) {
      const summary = summarizeItem(item);
      const parts = [
        summary.id ? `id=${summary.id}` : null,
        summary.name || '(unnamed)',
        summary.accountName && summary.accountName !== summary.name ? `account=${summary.accountName}` : null,
        summary.title ? `title=${summary.title}` : null,
        summary.status ? `status=${summary.status}` : null,
        summary.city || summary.province ? `location=${[summary.city, summary.province].filter(Boolean).join(', ')}` : null,
      ].filter(Boolean);

      console.log(`${index + 1}. ${parts.join(' | ')}`);
    }

    if (group.length > limit) {
      console.log(`... ${group.length - limit} more result${group.length - limit === 1 ? '' : 's'} not shown`);
    }
  }

  if (types.includes('notes') || notes.length > 0) {
    printNoteSummary(notes, limit);
  }
}

function dedupeResults(results) {
  const seen = new Set();
  const deduped = [];

  for (const item of results) {
    const key = `${getResultType(item)}:${getItemId(item) || getItemName(item)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function dedupeNotes(notes) {
  const seen = new Set();
  const deduped = [];

  for (const note of notes) {
    const summary = summarizeNote(note);
    const key = summary.id
      ? String(summary.id)
      : [summary.createdAt, summary.relatedType, summary.relatedId, summary.title, summary.content].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(note);
  }

  return deduped;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.query) {
    throw new Error('Missing search query. Example: node scripts/search-crm.js "Jazz Gill"');
  }

  loadDotEnv(envFilePath);
  requireCrmApiEnabled();
  const baseUrl = getRequiredEnv('CRM_BASE_URL');
  const token = getRequiredEnv('CRM_ACCESS_TOKEN');

  const resultTypes = args.types.filter((type) => type !== 'notes');
  const typesToSearch = resultTypes.length > 0 ? resultTypes : ['contacts', 'accounts'];
  const searchPayloads = await Promise.all(typesToSearch.map(async (type) => ({
    type,
    endpoint: getSearchRoute(type),
    payload: await fetchSearchResults(baseUrl, token, type, args.query),
  })));
  const list = sortResults(dedupeResults(searchPayloads.flatMap((entry) => extractList(entry.payload))), args.query);
  const displayResults = args.notesOnly ? [] : filterResults(list, resultTypes);
  const noteSourceResults = filterResults(list, typesToSearch);
  const notes = args.includeNotes
    ? dedupeNotes((await Promise.all(noteSourceResults.map((result) => fetchRelatedNotes(baseUrl, token, result)))).flat())
    : [];

  if (args.json) {
    console.log(JSON.stringify({
      query: args.query,
      endpoints: searchPayloads.map((entry) => entry.endpoint),
      notesEndpointsUsed: args.includeNotes,
      totalResults: list.length,
      filteredResults: displayResults.length,
      results: displayResults,
      notes,
    }, null, 2));
    return;
  }

  printSummary(args.notesOnly ? [] : list, args.notesOnly ? ['notes'] : args.types, args.limit, args.query, notes);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
