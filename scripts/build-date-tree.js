#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { normalizeTeamId } = require('./layered-artifact-utils');

const workspaceRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(workspaceRoot, 'data');
const rawDataRoot = path.join(dataRoot, 'raw');
const notesPath = path.join(rawDataRoot, 'my-notes.json');

function getTeamResourcePaths(kind) {
  const pattern = new RegExp(`^${kind}-([^/]+)\\.json$`);
  return fs
    .readdirSync(rawDataRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => {
      const match = entry.name.match(pattern);
      return {
        teamId: normalizeTeamId(match[1]),
        filePath: path.join(rawDataRoot, entry.name),
      };
    })
    .filter((entry) => entry.teamId !== null)
    .sort((left, right) => left.teamId.localeCompare(right.teamId) || left.filePath.localeCompare(right.filePath));
}

function readJsonArray(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : null;
  if (!Array.isArray(list)) {
    throw new Error(`Expected array payload in ${filePath}`);
  }
  return list;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getNoteFilePath(dayRoot, noteId) {
  return path.join(dayRoot, 'notes', String(noteId), `note-${noteId}-data.json`);
}

function getAccountFilePath(dayRoot, accountId) {
  return path.join(dayRoot, 'accounts', String(accountId), `account-${accountId}-data.json`);
}

function getContactFilePath(dayRoot, contactId) {
  return path.join(dayRoot, 'contacts', String(contactId), `contact-${contactId}-data.json`);
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

function recordTeamId(record, fallbackTeamId) {
  const data = parseDataBlob(record.data);
  const explicit = normalizeTeamId(record.teamId || record.team_id || data.teamId || data.team_id);
  if (explicit) {
    return explicit;
  }
  return fallbackTeamId === '1' ? '0' : fallbackTeamId;
}

function getDayParts(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid CreatedAt value: ${createdAt}`);
  }
  return {
    yyyy: String(date.getUTCFullYear()),
    mm: String(date.getUTCMonth() + 1).padStart(2, '0'),
    dd: String(date.getUTCDate()).padStart(2, '0'),
  };
}

function addRecord(index, teamId, record) {
  const id = normalizeId(record.id);
  if (id === null) {
    return;
  }
  if (!index.recordsById.has(id)) {
    index.recordsById.set(id, []);
  }
  index.recordsById.get(id).push({ teamId, record });
  if (!index.byTeam.has(teamId)) {
    index.byTeam.set(teamId, new Map());
  }
  if (!index.byTeam.get(teamId).has(id)) {
    index.byTeam.get(teamId).set(id, record);
  }
  if (!index.teamsById.has(id)) {
    index.teamsById.set(id, new Set());
  }
  index.teamsById.get(id).add(teamId);
}

function readTeamRecords(kind) {
  const index = {
    byTeam: new Map(),
    teamsById: new Map(),
    recordsById: new Map(),
  };

  for (const { teamId, filePath } of getTeamResourcePaths(kind)) {
    for (const record of readJsonArray(filePath)) {
      addRecord(index, recordTeamId(record, teamId), record);
    }
  }

  return index;
}

function getBucket(dailyBuckets, teamId, yyyy, mm, dd) {
  const dayKey = `${teamId}-${yyyy}-${mm}-${dd}`;
  if (!dailyBuckets.has(dayKey)) {
    dailyBuckets.set(dayKey, {
      teamId,
      yyyy,
      mm,
      dd,
      notes: new Map(),
      accountIds: new Set(),
      contactIds: new Set(),
    });
  }
  return dailyBuckets.get(dayKey);
}

function addTeamsForAccount(accounts, targetTeamIds, accountId, missingAccounts) {
  if (accountId === null) {
    return;
  }
  const teams = accounts.teamsById.get(accountId);
  if (!teams || teams.size === 0) {
    missingAccounts.add(accountId);
    return;
  }
  for (const teamId of teams) {
    targetTeamIds.add(teamId);
  }
}

function getContactAccountIds(contacts, contactId, missingContacts) {
  if (contactId === null) {
    return [];
  }

  const records = contacts.recordsById.get(contactId) || [];
  if (records.length === 0) {
    missingContacts.add(contactId);
    return [];
  }

  const accountIds = [];
  for (const { record } of records) {
    const data = parseDataBlob(record.data);
    const accountId = normalizeId(record.accountId || record.ContactAccountId || data.accountId || data.companyId);
    if (accountId !== null && !accountIds.includes(accountId)) {
      accountIds.push(accountId);
    }
  }
  return accountIds;
}

function getContactRecordForTeam(contacts, contactId, teamId, linkedAccountIds) {
  const records = contacts.recordsById.get(contactId) || [];
  const sameTeam = records.find((entry) => entry.teamId === teamId);
  if (sameTeam) {
    return sameTeam.record;
  }

  return records.find((entry) => {
    const data = parseDataBlob(entry.record.data);
    const accountId = normalizeId(entry.record.accountId || entry.record.ContactAccountId || data.accountId || data.companyId);
    return linkedAccountIds.includes(accountId);
  })?.record || null;
}

function main() {
  const notes = readJsonArray(notesPath)
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.CreatedAt).getTime();
      const rightTime = new Date(right.CreatedAt).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return Number(left.Id || 0) - Number(right.Id || 0);
    });
  const accounts = readTeamRecords('accounts');
  const contacts = readTeamRecords('contacts');

  const dailyBuckets = new Map();
  const missingAccounts = new Set();
  const missingContacts = new Set();

  for (const note of notes) {
    const noteId = normalizeId(note.Id);
    if (noteId === null) {
      continue;
    }

    const { yyyy, mm, dd } = getDayParts(note.CreatedAt);
    const accountIds = [note.ContactAccountId, note.accountId]
      .map(normalizeId)
      .filter((id, index, values) => id !== null && values.indexOf(id) === index);
    const contactId = normalizeId(note.contactId);
    const contactAccountIds = getContactAccountIds(contacts, contactId, missingContacts);
    const linkedAccountIds = [...new Set([...accountIds, ...contactAccountIds])];
    const targetTeamIds = new Set();

    for (const accountId of linkedAccountIds) {
      addTeamsForAccount(accounts, targetTeamIds, accountId, missingAccounts);
    }

    for (const teamId of [...targetTeamIds].sort()) {
      const bucket = getBucket(dailyBuckets, teamId, yyyy, mm, dd);
      bucket.notes.set(noteId, note);

      const teamAccounts = accounts.byTeam.get(teamId) || new Map();

      for (const accountId of linkedAccountIds) {
        if (teamAccounts.has(accountId)) {
          bucket.accountIds.add(accountId);
        }
      }
      if (contactId !== null && getContactRecordForTeam(contacts, contactId, teamId, linkedAccountIds)) {
        bucket.contactIds.add(contactId);
      }
    }
  }

  let noteFileCount = 0;
  let accountFileCount = 0;
  let contactFileCount = 0;

  for (const bucket of dailyBuckets.values()) {
    const dayRoot = path.join(dataRoot, bucket.teamId, bucket.yyyy, bucket.mm, bucket.dd);
    const teamAccounts = accounts.byTeam.get(bucket.teamId) || new Map();

    for (const note of [...bucket.notes.values()].sort((left, right) => Number(left.Id || 0) - Number(right.Id || 0))) {
      writeJson(getNoteFilePath(dayRoot, note.Id), note);
      noteFileCount += 1;
    }

    for (const accountId of [...bucket.accountIds].sort((left, right) => left - right)) {
      writeJson(getAccountFilePath(dayRoot, accountId), teamAccounts.get(accountId));
      accountFileCount += 1;
    }

    for (const contactId of [...bucket.contactIds].sort((left, right) => left - right)) {
      const linkedAccountIds = [...(contacts.recordsById.get(contactId) || [])]
        .map((entry) => {
          const data = parseDataBlob(entry.record.data);
          return normalizeId(entry.record.accountId || entry.record.ContactAccountId || data.accountId || data.companyId);
        })
        .filter((id, index, values) => id !== null && values.indexOf(id) === index);
      const contact = getContactRecordForTeam(contacts, contactId, bucket.teamId, linkedAccountIds);
      if (contact) {
        writeJson(getContactFilePath(dayRoot, contactId), contact);
        contactFileCount += 1;
      }
    }
  }

  console.log(JSON.stringify({
    teamDates: dailyBuckets.size,
    teams: [...new Set([...dailyBuckets.values()].map((bucket) => bucket.teamId))].sort(),
    notesWritten: noteFileCount,
    accountFilesWritten: accountFileCount,
    contactFilesWritten: contactFileCount,
    missingAccounts: [...missingAccounts].sort((left, right) => left - right),
    missingContacts: [...missingContacts].sort((left, right) => left - right),
  }, null, 2));
}

main();
