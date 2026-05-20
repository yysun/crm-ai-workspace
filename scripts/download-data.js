#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

    const rawValue = normalized.slice(equalsIndex + 1);
    process.env[key] = parseEnvValue(rawValue);
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildUrl(baseUrl, routePath) {
  return new URL(routePath.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function extractList(payload, label) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  throw new Error(`Expected ${label} response to be an array or an object with a data array.`);
}

async function fetchJson(baseUrl, token, routePath, label) {
  const url = buildUrl(baseUrl, routePath);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} request failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchList(baseUrl, token, routePath, label) {
  const payload = await fetchJson(baseUrl, token, routePath, label);
  return extractList(payload, label);
}

function collectTeamIds(payload) {
  const teamIds = new Set(['-1']);

  function addId(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    if (Number.isInteger(numericValue) && numericValue > 0) {
      teamIds.add(String(numericValue));
    }
  }

  function visit(value, context) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, context);
      }
      return;
    }

    if (!value || typeof value !== 'object') {
      if (context === 'team-id') {
        addId(value);
      }
      return;
    }

    if (Array.isArray(value.teamIds)) {
      visit(value.teamIds, 'team-id');
    }

    if (Array.isArray(value.teams)) {
      visit(value.teams, 'team-object');
    }

    if (value.team) {
      visit(value.team, 'team-object');
    }

    if (Array.isArray(value.data)) {
      visit(value.data, context);
    }

    if (Object.prototype.hasOwnProperty.call(value, 'teamId')) {
      addId(value.teamId);
    }

    if (Object.prototype.hasOwnProperty.call(value, 'team_id')) {
      addId(value.team_id);
    }

    if (context === 'team-object' && Object.prototype.hasOwnProperty.call(value, 'id')) {
      addId(value.id);
    }
  }

  visit(payload, 'root');

  return Array.from(teamIds);
}

async function main() {
  loadDotEnv(envFilePath);

  const baseUrl = getRequiredEnv('CRM_BASE_URL');
  const token = getRequiredEnv('CRM_ACCESS_TOKEN');

  const targets = [
    {
      label: 'notes',
      routePath: '/api/data/users/me/notes',
      outputPath: path.join(rawDataRoot, 'my-notes.json'),
    },
  ];

  const results = await Promise.all(
    targets.map(async (target) => {
      const list = await fetchList(baseUrl, token, target.routePath, target.label);
      writeJson(target.outputPath, list);
      return {
        label: target.label,
        outputPath: path.relative(workspaceRoot, target.outputPath).split(path.sep).join('/'),
        count: list.length,
      };
    })
  );

  const whoPayload = await fetchJson(baseUrl, token, '/api/data/who', 'who');
  const teamIds = collectTeamIds(whoPayload);
  if (teamIds.length === 0) {
    throw new Error('Could not determine any team IDs from the who response.');
  }

  const teamResults = await Promise.all(
    teamIds.map(async (teamId) => {
      const resources = await Promise.all([
        {
          kind: 'contacts',
          routePath: `/api/data/team/${encodeURIComponent(teamId)}/contacts`,
        },
        {
          kind: 'accounts',
          routePath: `/api/data/team/${encodeURIComponent(teamId)}/accounts`,
        },
      ].map(async (resource) => {
        const list = await fetchList(baseUrl, token, resource.routePath, `team ${teamId} ${resource.kind}`);

        if (list.length === 0) {
          return {
            kind: resource.kind,
            count: 0,
            outputPath: null,
          };
        }

        const normalizedTeamFileId = String(teamId) === '-1' ? '0' : String(teamId);
        const teamFileSuffix = `-${normalizedTeamFileId}`;
        const outputPath = path.join(rawDataRoot, `${resource.kind}${teamFileSuffix}.json`);
        writeJson(outputPath, list);

        return {
          kind: resource.kind,
          count: list.length,
          outputPath: path.relative(workspaceRoot, outputPath).split(path.sep).join('/'),
        };
      }));

      return {
        teamId,
        resources,
      };
    })
  );

  console.log(JSON.stringify({
    envFile: fs.existsSync(envFilePath) ? path.relative(workspaceRoot, envFilePath) : null,
    results,
    teamIds,
    teamResults,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
