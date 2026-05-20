#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(workspaceRoot, 'scripts');
const dataRoot = path.join(workspaceRoot, 'data');
const rawDataRoot = path.join(dataRoot, 'raw');
const notesPath = path.join(rawDataRoot, 'my-notes.json');

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
  };

  for (const part of argv) {
    if (part.startsWith('--year=')) {
      const year = part.slice('--year='.length).trim();
      if (year) {
        args.years.push(year);
      }
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  runStep('Download API data', 'download-data.js');
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
    years,
  }, null, 2));
}

main();
