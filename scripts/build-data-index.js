#!/usr/bin/env node

/*
 * Features: builds deterministic local routing indexes for CRM accounts, contacts,
 * generated source layers, current actions, date coverage, and tokenized search.
 * Implementation notes: index rows are not evidence; they only point agents to
 * source and summary files that must be read before franchise judgment.
 * Recent changes: added stale-layer flags, richer search rows, token index output,
 * current-action context, and freshness metadata for local search workflows.
 */

const fs = require('fs');
const path = require('path');
const { normalizeTeamId } = require('./layered-artifact-utils');

const workspaceRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(workspaceRoot, 'data');
const rawDataRoot = path.join(dataRoot, 'raw');
const indexRoot = path.join(dataRoot, 'index');

function parseArgs(argv) {
  const args = {
    team: null,
    years: [],
  };

  for (const part of argv) {
    if (part.startsWith('--team=')) {
      args.team = normalizeTeamId(part.slice('--team='.length));
      continue;
    }
    if (part.startsWith('--year=')) {
      const year = part.slice('--year='.length).trim();
      if (year) {
        args.years.push(year);
      }
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

function readJsonArray(filePath) {
  const raw = readJson(filePath);
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : null;
  if (!Array.isArray(list)) {
    throw new Error(`Expected array payload in ${filePath}`);
  }
  return list;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, rows) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
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

function getRecordTeamId(record, data, fallbackTeamId) {
  const explicit = normalizeTeamId(record.teamId || record.team_id || data.teamId || data.team_id);
  if (explicit) {
    return explicit;
  }
  return fallbackTeamId === '1' ? '0' : fallbackTeamId;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = compact(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }

  return result;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && compact(value) !== '');
}

function normalizeLookupTerm(value) {
  return compact(value).toLowerCase();
}

function tokenizeLookupTerm(value) {
  return normalizeLookupTerm(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function getRawPaths(pattern) {
  if (!fs.existsSync(rawDataRoot)) {
    return [];
  }

  return fs
    .readdirSync(rawDataRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(rawDataRoot, entry.name))
    .sort();
}

function getRawResourcePaths(kind) {
  const pattern = new RegExp(`^${kind}-([^/]+)\\.json$`);
  if (!fs.existsSync(rawDataRoot)) {
    return [];
  }

  return fs
    .readdirSync(rawDataRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(pattern);
      return {
        fallbackTeamId: normalizeTeamId(match[1]),
        objectType: kind,
        filePath: path.join(rawDataRoot, entry.name),
      };
    })
    .filter((entry) => entry.fallbackTeamId !== null)
    .sort((left, right) => left.fallbackTeamId.localeCompare(right.fallbackTeamId) || left.filePath.localeCompare(right.filePath));
}

function getAccountName(record, data) {
  return compact(record.name || data.companyName || `Account ${record.id}`);
}

function getContactName(record, data) {
  return compact(
    record.displayName ||
    data.displayName ||
    [data.firstName, data.lastName].filter(Boolean).join(' ') ||
    `Contact ${record.id}`
  );
}

function getRawEntityAliases(objectType, record, data) {
  if (objectType === 'accounts') {
    return uniqueStrings([
      record.name,
      data.companyName,
    ]);
  }

  return uniqueStrings([
    record.displayName,
    data.displayName,
    [data.firstName, data.lastName].filter(Boolean).join(' '),
  ]);
}

function getNestedPersonId(data) {
  for (const value of Object.values(data || {})) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const personId = normalizeId(value.PersonID || value.personID || value.rlpPersonId);
    if (personId !== null) {
      return personId;
    }
  }
  return null;
}

function getEntityIdentityKey(objectType, record, data) {
  if (objectType === 'contacts') {
    const personId = normalizeId(firstPresent(
      record.rlpPersonId,
      record.personId,
      record.personID,
      data.rlpPersonId,
      data.personID,
      data.PersonID,
      getNestedPersonId(data)
    ));
    return personId === null ? null : `rlpPersonId:${personId}`;
  }

  const companyId = normalizeId(firstPresent(
    record.rlpCompanyId,
    record.companyId,
    record.companyID,
    data.rlpCompanyId,
    data.companyId,
    data.companyID,
    data.brokerageID
  ));
  return companyId === null ? null : `companyId:${companyId}`;
}

function entityKey(teamId, objectType, objectId) {
  return `${teamId}:${objectType}:${objectId}`;
}

function makeBaseEntity(teamId, objectType, objectId) {
  return {
    team_id: teamId,
    object_type: objectType,
    object_id: objectId,
    name: objectType === 'accounts' ? `Account ${objectId}` : `Contact ${objectId}`,
    aliases: [],
    raw_files: [],
    source_count: 0,
    first_source_date: null,
    latest_source_date: null,
    latest_source: null,
    latest_summary: null,
    latest_summary_source_date: null,
    latest_summary_expires_at: null,
    latest_summary_status: null,
    latest_summary_expired: false,
    summary_is_stale_against_source: false,
    latest_action: null,
    latest_action_source_date: null,
    latest_action_expires_at: null,
    latest_action_status: null,
    latest_action_expired: false,
    action_is_stale_against_source: false,
    latest_action_open_count: 0,
    object_role: null,
    linked_account: null,
    brand_posture: null,
    commercial_program_posture: null,
    scope: null,
    status: null,
    market_markers: null,
    scale_signal: null,
    contract_and_tenure_fields: null,
  };
}

function collectRawEntities(teamFilter) {
  const entities = new Map();
  const rawPaths = [
    ...getRawResourcePaths('accounts'),
    ...getRawResourcePaths('contacts'),
  ];

  for (const { objectType, filePath, fallbackTeamId } of rawPaths) {
    for (const record of readJsonArray(filePath)) {
      const objectId = normalizeId(record.id);
      if (objectId === null) {
        continue;
      }

      const data = parseDataBlob(record.data);
      const teamId = getRecordTeamId(record, data, fallbackTeamId);
      if (teamFilter && teamId !== teamFilter) {
        continue;
      }
      const key = entityKey(teamId, objectType, objectId);
      const entity = entities.get(key) || makeBaseEntity(teamId, objectType, objectId);
      const name = objectType === 'accounts' ? getAccountName(record, data) : getContactName(record, data);

      entity.name = entity.name.match(/^(Account|Contact) \d+$/) ? name : entity.name;
      entity.aliases = uniqueStrings([...entity.aliases, ...getRawEntityAliases(objectType, record, data), name]);
      entity.raw_files = uniqueStrings([...entity.raw_files, toPosixRelative(filePath)]);

      if (objectType === 'contacts') {
        entity.linked_account = entity.linked_account || compact(record.accountName || data.companyName) || null;
      }
      entity._identity_key = entity._identity_key || getEntityIdentityKey(objectType, record, data);

      entities.set(key, entity);
    }
  }

  return entities;
}

function isTeamRootName(value) {
  const text = String(value || '');
  return /^\d+$/.test(text) && !/^\d{4}$/.test(text);
}

function collectYearRoots(args) {
  if (!fs.existsSync(dataRoot)) {
    return [];
  }

  const teamRoots = args.team
    ? [path.join(dataRoot, args.team)]
    : fs.readdirSync(dataRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isTeamRootName(entry.name))
      .map((entry) => path.join(dataRoot, entry.name))
      .sort();

  if (args.years.length > 0) {
    return teamRoots.flatMap((teamRoot) => (
      [...new Set(args.years)].sort().map((year) => path.join(teamRoot, year))
    ));
  }

  return teamRoots.flatMap((teamRoot) => {
    if (!fs.existsSync(teamRoot)) {
      return [];
    }
    return fs
      .readdirSync(teamRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
      .map((entry) => path.join(teamRoot, entry.name))
      .sort();
  });
}

function walkFiles(dirPath, visit) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, visit);
      continue;
    }
    visit(entryPath);
  }
}

function collectLayerFiles(yearRoots, suffix) {
  const files = [];

  for (const yearRoot of yearRoots) {
    walkFiles(yearRoot, (filePath) => {
      if (filePath.endsWith(suffix)) {
        files.push(filePath);
      }
    });
  }

  return files.sort();
}

function unquote(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return { frontmatter: {}, body: text };
  }

  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const frontmatter = {};
  let currentArrayKey = null;

  for (const rawLine of match[1].split('\n')) {
    if (/^\s*$/.test(rawLine)) {
      continue;
    }

    const arrayMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentArrayKey) {
      frontmatter[currentArrayKey].push(unquote(arrayMatch[1]));
      continue;
    }

    const keyMatch = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) {
      currentArrayKey = null;
      continue;
    }

    const [, key, value] = keyMatch;
    if (value === '') {
      frontmatter[key] = [];
      currentArrayKey = key;
    } else {
      frontmatter[key] = unquote(value);
      currentArrayKey = null;
    }
  }

  return {
    frontmatter,
    body: text.slice(match[0].length),
  };
}

function parseSections(body) {
  const sections = {};
  let current = null;

  for (const line of body.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      current = match[1].trim();
      sections[current] = [];
      continue;
    }

    if (current) {
      sections[current].push(line);
    }
  }

  return sections;
}

function readMarkdown(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(text);
  return {
    ...parsed,
    sections: parseSections(parsed.body),
  };
}

function parseObjectSnapshot(lines) {
  const snapshot = {};

  for (const line of lines || []) {
    const match = line.match(/^- ([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    snapshot[key] = compact(match[2].replace(/\.$/, ''));
  }

  return snapshot;
}

function compareDatedPath(left, right) {
  const leftDate = left.source_date || '';
  const rightDate = right.source_date || '';
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return String(left.path || '').localeCompare(String(right.path || ''));
}

function isNewer(left, right) {
  if (!right) {
    return true;
  }
  return compareDatedPath(left, right) > 0;
}

function isExpiredAt(expiresAt, now = Date.now()) {
  if (!expiresAt || expiresAt === 'none') {
    return false;
  }

  const time = new Date(expiresAt).getTime();
  return !Number.isNaN(time) && time < now;
}

function isLayerStaleAgainstSource(layerSourceDate, latestSourceDate) {
  return Boolean(layerSourceDate && latestSourceDate && layerSourceDate < latestSourceDate);
}

function getObjectFromFrontmatter(filePath, frontmatter) {
  const pathMatch = toPosixRelative(filePath).match(/^data\/(\d+)\/\d{4}\/\d{2}\/\d{2}\/(accounts|contacts)\/(\d+)\//);
  const teamId = normalizeTeamId(frontmatter.team_id || (pathMatch && pathMatch[1]));
  const objectType = frontmatter.object_type || (pathMatch && pathMatch[2]);
  const objectId = normalizeId(frontmatter.object_id || (pathMatch && pathMatch[3]));

  if (!teamId || !objectType || objectId === null) {
    return null;
  }

  return { teamId, objectType, objectId };
}

function parsePrimaryObjectName(primaryObject, objectType, objectId) {
  const singular = objectType === 'accounts' ? 'account' : 'contact';
  const match = String(primaryObject || '').match(new RegExp(`^(.+),\\s*${singular}\\s+${objectId}$`, 'i'));
  return match ? compact(match[1]) : null;
}

function getSourceObjectData(row) {
  const objectSingular = row.object_type === 'accounts' ? 'account' : 'contact';
  const pattern = new RegExp(`/${row.object_type}/${row.object_id}/${objectSingular}-${row.object_id}-data\\.json$`);
  const relativePath = (row.source_files || []).find((sourceFile) => pattern.test(sourceFile));
  if (!relativePath) {
    return null;
  }

  const filePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const record = readJson(filePath);
  return {
    record,
    data: parseDataBlob(record.data),
  };
}

function sourceMatchesCurrentRawIdentity(row, entity) {
  if (!entity || !entity._identity_key) {
    return true;
  }

  const sourceObjectData = getSourceObjectData(row);
  if (!sourceObjectData) {
    return true;
  }

  const sourceIdentityKey = getEntityIdentityKey(row.object_type, sourceObjectData.record, sourceObjectData.data);
  return !sourceIdentityKey || sourceIdentityKey === entity._identity_key;
}

function collectSources(yearRoots, entities) {
  const sourceRows = [];
  const latestSources = new Map();
  const firstDates = new Map();

  for (const filePath of collectLayerFiles(yearRoots, '-source.md')) {
    const markdown = readMarkdown(filePath);
    const object = getObjectFromFrontmatter(filePath, markdown.frontmatter);
    if (!object) {
      continue;
    }

    const snapshot = parseObjectSnapshot(markdown.sections['Object Snapshot']);
    const row = {
      team_id: object.teamId,
      object_type: object.objectType,
      object_id: object.objectId,
      source_date: markdown.frontmatter.source_date || null,
      path: toPosixRelative(filePath),
      source_files: Array.isArray(markdown.frontmatter.source_files) ? markdown.frontmatter.source_files : [],
      primary_object: snapshot.primary_object || null,
      object_role: snapshot.object_role || null,
      linked_account: snapshot.linked_account || null,
      brand_posture: snapshot.brand_posture || null,
      commercial_program_posture: snapshot.commercial_program_posture || null,
      scope: snapshot.scope || null,
      status: snapshot.status || null,
      market_markers: snapshot.market_markers || null,
      scale_signal: snapshot.scale_signal || null,
      contract_and_tenure_fields: snapshot.contract_and_tenure_fields || null,
    };

    const key = entityKey(object.teamId, object.objectType, object.objectId);
    const entity = entities.get(key) || makeBaseEntity(object.teamId, object.objectType, object.objectId);
    if (!sourceMatchesCurrentRawIdentity(row, entity)) {
      continue;
    }

    sourceRows.push(row);

    const sourceName = parsePrimaryObjectName(row.primary_object, object.objectType, object.objectId);
    if (sourceName) {
      entity.name = entity.name.match(/^(Account|Contact) \d+$/) ? sourceName : entity.name;
      entity.aliases = uniqueStrings([...entity.aliases, sourceName]);
    }
    entity.source_count += 1;
    entities.set(key, entity);

    const previousLatest = latestSources.get(key);
    if (isNewer(row, previousLatest)) {
      latestSources.set(key, row);
    }

    if (row.source_date) {
      const previousFirst = firstDates.get(key);
      if (!previousFirst || row.source_date < previousFirst) {
        firstDates.set(key, row.source_date);
      }
    }
  }

  for (const [key, row] of latestSources) {
    const entity = entities.get(key);
    entity.first_source_date = firstDates.get(key) || null;
    entity.latest_source_date = row.source_date;
    entity.latest_source = row.path;
    entity.object_role = row.object_role;
    entity.linked_account = row.linked_account || entity.linked_account;
    entity.brand_posture = row.brand_posture;
    entity.commercial_program_posture = row.commercial_program_posture;
    entity.scope = row.scope;
    entity.status = row.status;
    entity.market_markers = row.market_markers;
    entity.scale_signal = row.scale_signal;
    entity.contract_and_tenure_fields = row.contract_and_tenure_fields;
  }

  return sourceRows.sort(compareDatedPath);
}

function collectLatestLayerPaths(yearRoots, suffix) {
  const latest = new Map();

  for (const filePath of collectLayerFiles(yearRoots, suffix)) {
    const markdown = readMarkdown(filePath);
    const object = getObjectFromFrontmatter(filePath, markdown.frontmatter);
    if (!object) {
      continue;
    }

    const row = {
      team_id: object.teamId,
      object_type: object.objectType,
      object_id: object.objectId,
      source_date: markdown.frontmatter.source_date || null,
      path: toPosixRelative(filePath),
      expires_at: markdown.frontmatter.expires_at || null,
      status: markdown.frontmatter.status || null,
    };
    const key = entityKey(object.teamId, object.objectType, object.objectId);
    if (isNewer(row, latest.get(key))) {
      latest.set(key, row);
    }
  }

  return latest;
}

function extractActionItems(markdown) {
  const actions = [];

  for (const line of markdown.sections['Proposed Actions'] || []) {
    const match = line.match(/^- \[([ xX])\]\s+(.+)$/);
    if (!match) {
      continue;
    }

    actions.push({
      checked: match[1].toLowerCase() === 'x',
      text: compact(match[2]),
    });
  }

  return actions;
}

function collectCurrentActions(yearRoots, entities) {
  const latestActions = new Map();
  const now = Date.now();

  for (const filePath of collectLayerFiles(yearRoots, '-summary.md')) {
    const markdown = readMarkdown(filePath);
    const object = getObjectFromFrontmatter(filePath, markdown.frontmatter);
    if (!object) {
      continue;
    }

    const row = {
      team_id: object.teamId,
      object_type: object.objectType,
      object_id: object.objectId,
      source_date: markdown.frontmatter.source_date || null,
      path: toPosixRelative(filePath),
      expires_at: markdown.frontmatter.expires_at || null,
      status: markdown.frontmatter.status || null,
      open_actions: extractActionItems(markdown).filter((action) => !action.checked).map((action) => action.text),
    };
    const key = entityKey(object.teamId, object.objectType, object.objectId);
    if (isNewer(row, latestActions.get(key))) {
      latestActions.set(key, row);
    }
  }

  const currentRows = [];
  for (const [key, row] of latestActions) {
    const expiresAt = row.expires_at && row.expires_at !== 'none' ? new Date(row.expires_at).getTime() : null;
    const isExpired = expiresAt !== null && !Number.isNaN(expiresAt) && expiresAt < now;
    const entity = entities.get(key) || makeBaseEntity(row.team_id, row.object_type, row.object_id);
    entity.latest_action = row.path;
    entity.latest_action_source_date = row.source_date;
    entity.latest_action_expires_at = row.expires_at;
    entity.latest_action_status = row.status;
    entity.latest_action_expired = isExpired;
    entity.latest_action_open_count = isExpired ? 0 : row.open_actions.length;
    entities.set(key, entity);

    if (!isExpired && row.open_actions.length > 0) {
      currentRows.push({
        ...row,
        name: entity.name,
        object_role: entity.object_role,
        linked_account: entity.linked_account,
        brand_posture: entity.brand_posture,
        commercial_program_posture: entity.commercial_program_posture,
        scope: entity.scope,
        entity_status: entity.status,
        market_markers: entity.market_markers,
        scale_signal: entity.scale_signal,
        latest_source: entity.latest_source,
        latest_summary: entity.latest_summary,
        open_action_count: row.open_actions.length,
        expired: false,
      });
    }
  }

  return currentRows.sort(compareDatedPath);
}

function attachLatestSummaries(yearRoots, entities) {
  const now = Date.now();
  for (const [key, row] of collectLatestLayerPaths(yearRoots, '-summary.md')) {
    const entity = entities.get(key) || makeBaseEntity(row.team_id, row.object_type, row.object_id);
    entity.latest_summary = row.path;
    entity.latest_summary_source_date = row.source_date;
    entity.latest_summary_expires_at = row.expires_at;
    entity.latest_summary_status = row.status;
    entity.latest_summary_expired = isExpiredAt(row.expires_at, now);
    entities.set(key, entity);
  }
}

function finalizeEntityLayerFlags(entities) {
  for (const entity of entities.values()) {
    entity.summary_is_stale_against_source = isLayerStaleAgainstSource(
      entity.latest_summary_source_date,
      entity.latest_source_date
    );
    entity.action_is_stale_against_source = isLayerStaleAgainstSource(
      entity.latest_action_source_date,
      entity.latest_source_date
    );
  }
}

function entitySearchRow(entity, extra = {}) {
  return {
    team_id: entity.team_id,
    object_type: entity.object_type,
    object_id: entity.object_id,
    name: entity.name,
    latest_source_date: entity.latest_source_date,
    latest_source: entity.latest_source,
    latest_summary: entity.latest_summary,
    latest_summary_source_date: entity.latest_summary_source_date,
    latest_summary_expired: entity.latest_summary_expired,
    summary_is_stale_against_source: entity.summary_is_stale_against_source,
    latest_action: entity.latest_action,
    latest_action_source_date: entity.latest_action_source_date,
    latest_action_expired: entity.latest_action_expired,
    action_is_stale_against_source: entity.action_is_stale_against_source,
    latest_action_open_count: entity.latest_action_open_count,
    object_role: entity.object_role,
    linked_account: entity.linked_account,
    brand_posture: entity.brand_posture,
    commercial_program_posture: entity.commercial_program_posture,
    scope: entity.scope,
    status: entity.status,
    market_markers: entity.market_markers,
    scale_signal: entity.scale_signal,
    ...extra,
  };
}

function compareEntitySearchRows(left, right) {
  const sourceCompare = Number(Boolean(right.latest_source)) - Number(Boolean(left.latest_source));
  if (sourceCompare !== 0) {
    return sourceCompare;
  }

  const actionCompare = Number(right.latest_action_open_count || 0) - Number(left.latest_action_open_count || 0);
  if (actionCompare !== 0) {
    return actionCompare;
  }

  const dateCompare = String(right.latest_source_date || '').localeCompare(String(left.latest_source_date || ''));
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const typeCompare = left.object_type.localeCompare(right.object_type);
  if (typeCompare !== 0) {
    return typeCompare;
  }

  const teamCompare = String(left.team_id || '').localeCompare(String(right.team_id || ''));
  if (teamCompare !== 0) {
    return teamCompare;
  }

  return left.object_id - right.object_id;
}

function buildNamesIndex(entities) {
  const names = {};

  for (const entity of entities) {
    for (const alias of uniqueStrings([entity.name, ...entity.aliases])) {
      const term = normalizeLookupTerm(alias);
      if (!term) {
        continue;
      }
      if (!names[term]) {
        names[term] = [];
      }
      const existingIndex = names[term].findIndex((row) => (
        row.team_id === entity.team_id && row.object_type === entity.object_type && row.object_id === entity.object_id
      ));
      const row = entitySearchRow(entity);
      if (existingIndex >= 0) {
        names[term][existingIndex] = row;
      } else {
        names[term].push(row);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(names)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([term, rows]) => [
        term,
        rows.sort(compareEntitySearchRows),
      ])
  );
}

function buildTokenIndex(namesIndex) {
  const tokens = {};

  for (const [term, rows] of Object.entries(namesIndex)) {
    for (const token of tokenizeLookupTerm(term)) {
      if (!tokens[token]) {
        tokens[token] = [];
      }

      for (const row of rows) {
        const existingIndex = tokens[token].findIndex((candidate) => (
          candidate.team_id === row.team_id && candidate.object_type === row.object_type && candidate.object_id === row.object_id
        ));
        const tokenRow = { ...row, matched_term: term };
        if (existingIndex >= 0) {
          const existing = tokens[token][existingIndex];
          if (term.length < String(existing.matched_term || '').length) {
            tokens[token][existingIndex] = tokenRow;
          }
        } else {
          tokens[token].push(tokenRow);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(tokens)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([token, rows]) => [token, rows.sort(compareEntitySearchRows)])
  );
}

function buildDateRows(sourceRows, actionRows) {
  const dates = new Map();

  function getDateRow(teamId, sourceDate) {
    const date = sourceDate || 'unknown';
    const key = `${teamId}:${date}`;
    if (!dates.has(key)) {
      dates.set(key, {
        team_id: teamId,
        date,
        account_sources: 0,
        contact_sources: 0,
        current_action_objects: 0,
        current_open_actions: 0,
      });
    }
    return dates.get(key);
  }

  for (const row of sourceRows) {
    const dateRow = getDateRow(row.team_id, row.source_date);
    if (row.object_type === 'accounts') {
      dateRow.account_sources += 1;
    } else if (row.object_type === 'contacts') {
      dateRow.contact_sources += 1;
    }
  }

  for (const row of actionRows) {
    const dateRow = getDateRow(row.team_id, row.source_date);
    dateRow.current_action_objects += 1;
    dateRow.current_open_actions += row.open_actions.length;
  }

  return [...dates.values()].sort((left, right) => (
    String(left.team_id).localeCompare(String(right.team_id)) || left.date.localeCompare(right.date)
  ));
}

function publicEntityRow(entity) {
  const { _identity_key, ...row } = entity;
  return row;
}

function collectFreshness(yearRoots) {
  const rawPaths = getRawPaths(/^[^/]+\.json$/);
  const layerRoots = yearRoots.filter((root) => fs.existsSync(root));

  function scanFile(filePath, stats) {
    const stat = fs.statSync(filePath);
    stats.file_count += 1;
    if (!stats.latest_mtime_ms || stat.mtimeMs > stats.latest_mtime_ms) {
      stats.latest_mtime_ms = stat.mtimeMs;
      stats.latest_mtime_path = toPosixRelative(filePath);
    }
  }

  function scanTree(dirPath, stats) {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanTree(entryPath, stats);
      } else if (entry.isFile()) {
        scanFile(entryPath, stats);
      }
    }
  }

  const rawStats = { file_count: 0, latest_mtime_ms: null, latest_mtime_path: null };
  for (const filePath of rawPaths) {
    scanFile(filePath, rawStats);
  }

  const layerStats = { file_count: 0, latest_mtime_ms: null, latest_mtime_path: null };
  for (const root of layerRoots) {
    scanTree(root, layerStats);
  }

  return {
    raw_file_count: rawStats.file_count,
    raw_latest_mtime: rawStats.latest_mtime_ms ? new Date(rawStats.latest_mtime_ms).toISOString() : null,
    raw_latest_mtime_path: rawStats.latest_mtime_path,
    layer_file_count: layerStats.file_count,
    layer_latest_mtime: layerStats.latest_mtime_ms ? new Date(layerStats.latest_mtime_ms).toISOString() : null,
    layer_latest_mtime_path: layerStats.latest_mtime_path,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const yearRoots = collectYearRoots(args);
  const entities = collectRawEntities(args.team);
  const sourceRows = collectSources(yearRoots, entities);
  attachLatestSummaries(yearRoots, entities);
  const actionRows = collectCurrentActions(yearRoots, entities);
  finalizeEntityLayerFlags(entities);
  const entityRows = [...entities.values()].map(publicEntityRow).sort((left, right) => {
    const teamCompare = String(left.team_id || '').localeCompare(String(right.team_id || ''));
    if (teamCompare !== 0) {
      return teamCompare;
    }
    const typeCompare = left.object_type.localeCompare(right.object_type);
    if (typeCompare !== 0) {
      return typeCompare;
    }
    return left.object_id - right.object_id;
  });

  const namesIndex = buildNamesIndex(entityRows);
  const tokenIndex = buildTokenIndex(namesIndex);
  const dateRows = buildDateRows(sourceRows, actionRows);
  const generatedAt = new Date().toISOString();
  const meta = {
    generated_at: generatedAt,
    team: args.team,
    year_roots: yearRoots.map((root) => toPosixRelative(root)),
    files: {
      entities: 'data/index/entities.jsonl',
      names: 'data/index/names.json',
      tokens: 'data/index/tokens.json',
      sources: 'data/index/sources.jsonl',
      actions_current: 'data/index/actions-current.jsonl',
      dates: 'data/index/dates.jsonl',
    },
    counts: {
      entities: entityRows.length,
      names: Object.keys(namesIndex).length,
      tokens: Object.keys(tokenIndex).length,
      sources: sourceRows.length,
      current_action_objects: actionRows.length,
      dates: dateRows.length,
    },
    freshness: {
      index_generated_at: generatedAt,
      ...collectFreshness(yearRoots),
    },
    evidence_boundary: 'Index rows are routing aids only. Read referenced source and summary files before franchise judgment.',
  };

  writeJsonl(path.join(indexRoot, 'entities.jsonl'), entityRows);
  writeJson(path.join(indexRoot, 'names.json'), namesIndex);
  writeJson(path.join(indexRoot, 'tokens.json'), tokenIndex);
  writeJsonl(path.join(indexRoot, 'sources.jsonl'), sourceRows);
  writeJsonl(path.join(indexRoot, 'actions-current.jsonl'), actionRows);
  writeJsonl(path.join(indexRoot, 'dates.jsonl'), dateRows);
  writeJson(path.join(indexRoot, 'index-meta.json'), meta);

  console.log(JSON.stringify(meta, null, 2));
}

main();
