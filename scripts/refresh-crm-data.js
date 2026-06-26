#!/usr/bin/env node

/**
 * Refreshes local CRM evidence from the configured raw data source, then rebuilds
 * dated exports, generated source files, and routing indexes. Recent change:
 * supports SQL Server raw export as the preferred source when SQL_* env exists.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(workspaceRoot, 'scripts');
const dataRoot = path.join(workspaceRoot, 'data');
const rawDataRoot = path.join(dataRoot, 'raw');
const notesPath = path.join(rawDataRoot, 'my-notes.json');
const envFilePath = path.join(workspaceRoot, '.env');

function runStep(label, scriptName, extraArgs = []) {
  console.log(`\n== ${label} ==`);

  const result = spawnSync(process.execPath, [path.join(scriptsRoot, scriptName), ...extraArgs], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status}`);
  }
}

function readJsonArray(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : null;
  if (!Array.isArray(list)) {
    throw new Error(`Expected array payload in ${filePath}`);
  }
  return list;
}

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
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

function hasSqlConfig() {
  return ['SQL_SERVER', 'SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD'].every((name) => Boolean(process.env[name]));
}

function normalizeSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!['api', 'sql'].includes(source)) {
    throw new Error(`Unsupported data source value: ${source}. Use sql or api.`);
  }
  return source;
}

function getYearsFromNotes(filePath) {
  const years = new Set();

  for (const note of readJsonArray(filePath)) {
    const createdAt = new Date(note.CreatedAt);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }
    years.add(String(createdAt.getUTCFullYear()));
  }

  return [...years].sort();
}

function parseArgs(argv) {
  const args = {
    years: [],
    source: null,
  };

  for (const part of argv) {
    if (part.startsWith('--year=')) {
      const year = part.slice('--year='.length).trim();
      if (year) {
        args.years.push(year);
      }
    } else if (part.startsWith('--source=')) {
      args.source = normalizeSource(part.slice('--source='.length));
    }
  }

  return args;
}

function main() {
  loadDotEnv(envFilePath);
  const args = parseArgs(process.argv.slice(2));
  const source = args.source || (process.env.AIW_CRM_DATA_SOURCE ? normalizeSource(process.env.AIW_CRM_DATA_SOURCE) : (hasSqlConfig() ? 'sql' : 'api'));
  const downloadScript = source === 'sql' ? 'download-data-sql.js' : 'download-data.js';

  runStep(`Download ${source.toUpperCase()} data`, downloadScript);
  runStep('Export dated note/account/contact data', 'build-date-tree.js');

  const years = args.years.length > 0 ? [...new Set(args.years)].sort() : getYearsFromNotes(notesPath);

  if (years.length === 0) {
    console.log('\nNo note years found in data/raw/my-notes.json. Skipping source generation.');
    return;
  }

  for (const year of years) {
    runStep(`Generate source markdown for ${year}`, 'generate-source.js', [`--year=${year}`, '--overwrite']);
  }

  runStep('Build data routing index', 'build-data-index.js');

  console.log(JSON.stringify({
    completed: true,
    source,
    years,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
