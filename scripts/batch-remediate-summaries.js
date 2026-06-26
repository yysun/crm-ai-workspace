#!/usr/bin/env node

/*
 * Builds and optionally launches Codex CLI summary-remediation batches.
 *
 * Feature notes:
 * This script owns routing state only: target audit, fixed manifest creation,
 * disjoint batch assignment, worker prompt files, and optional Codex CLI launch.
 * It does not draft, split, transform, or rewrite `*-summary.md` content.
 * Worker agents must author assigned summaries from AGENTS.md, process docs,
 * current `*-source.md` files, and referenced local note evidence.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const defaultModel = 'gpt-5.5-medium';

function dateParts(isoDate) {
  const now = new Date(`${isoDate}T00:00:00Z`);
  return {
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1).padStart(2, '0'),
    day: String(now.getUTCDate()).padStart(2, '0'),
  };
}

function parseArgs(argv) {
  const args = {
    from: null,
    to: null,
    team: null,
    batchSize: 100,
    model: defaultModel,
    manifest: null,
    dryRun: false,
    runWorkers: false,
    parallel: 1,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part === '--run-workers') {
      args.runWorkers = true;
      continue;
    }
    if (part === '--json') {
      args.json = true;
      continue;
    }
    const readValue = (label) => {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value after ${label}.`);
      }
      index += 1;
      return value;
    };
    if (part === '--from') {
      args.from = readValue('--from');
      continue;
    }
    if (part.startsWith('--from=')) {
      args.from = part.slice('--from='.length);
      continue;
    }
    if (part === '--to') {
      args.to = readValue('--to');
      continue;
    }
    if (part.startsWith('--to=')) {
      args.to = part.slice('--to='.length);
      continue;
    }
    if (part === '--team') {
      args.team = readValue('--team');
      continue;
    }
    if (part.startsWith('--team=')) {
      args.team = part.slice('--team='.length);
      continue;
    }
    if (part === '--batch-size') {
      args.batchSize = Number(readValue('--batch-size'));
      continue;
    }
    if (part.startsWith('--batch-size=')) {
      args.batchSize = Number(part.slice('--batch-size='.length));
      continue;
    }
    if (part === '--parallel') {
      args.parallel = Number(readValue('--parallel'));
      continue;
    }
    if (part.startsWith('--parallel=')) {
      args.parallel = Number(part.slice('--parallel='.length));
      continue;
    }
    if (part === '--model') {
      args.model = readValue('--model');
      continue;
    }
    if (part.startsWith('--model=')) {
      args.model = part.slice('--model='.length);
      continue;
    }
    if (part === '--manifest') {
      args.manifest = readValue('--manifest');
      continue;
    }
    if (part.startsWith('--manifest=')) {
      args.manifest = part.slice('--manifest='.length);
      continue;
    }
    throw new Error(`Unknown option: ${part}`);
  }

  if (!args.from || !args.to) {
    throw new Error('Pass --from=YYYY-MM-DD and --to=YYYY-MM-DD.');
  }
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 100) {
    throw new Error('--batch-size must be an integer from 1 to 100.');
  }
  if (!Number.isInteger(args.parallel) || args.parallel < 1) {
    throw new Error('--parallel must be a positive integer.');
  }
  if (args.runWorkers && args.dryRun) {
    throw new Error('Use either --dry-run or --run-workers, not both.');
  }
  return args;
}

function runJson(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function defaultManifestPath(args) {
  const { year, month, day } = dateParts(args.to);
  const suffix = args.team ? `team-${args.team}-` : '';
  return path.join(workspaceRoot, 'my-work', year, month, day, `summary-remediation-${suffix}${args.from}-to-${args.to}.json`);
}

function batchId(index) {
  return `batch-${String(index + 1).padStart(4, '0')}`;
}

function buildManifest(args, audit) {
  const items = audit.items.map((item, index) => ({
    ordinal: index + 1,
    source_path: item.sourcePath,
    summary_path: item.summaryPath,
    reasons: item.reasons,
  }));
  const batches = [];
  for (let offset = 0; offset < items.length; offset += args.batchSize) {
    const batchItems = items.slice(offset, offset + args.batchSize);
    batches.push({
      batch_id: batchId(batches.length),
      count: batchItems.length,
      first_source: batchItems[0] ? batchItems[0].source_path : null,
      last_source: batchItems[batchItems.length - 1] ? batchItems[batchItems.length - 1].source_path : null,
      write_paths: batchItems.map((item) => item.summary_path),
      items: batchItems,
    });
  }

  return {
    manifest_version: 1,
    generated_at: new Date().toISOString(),
    purpose: 'Codex CLI agent-authored summary remediation',
    model: args.model,
    default_model: defaultModel,
    scope: audit.scope,
    source_files: audit.sourceFiles,
    eligible_source_files: audit.eligibleSourceFiles,
    excluded_source_files: audit.excludedSourceFiles,
    target_count: audit.targets,
    batch_size: args.batchSize,
    batch_count: batches.length,
    batches,
    non_goals: [
      'script-authored summary prose',
      'heuristic splitting of compound actions',
      'index rebuilds by workers',
      'Inbox posting by workers',
    ],
  };
}

function promptForBatch(manifestPath, batch) {
  return [
    'You are a Codex CLI worker in crm-ai-workspace.',
    '',
    `Manifest: ${manifestPath}`,
    `Batch: ${batch.batch_id}`,
    '',
    'Read AGENTS.md, process/distillation.md, process/summary.md, process/action.md, the object overlay for each assigned source, any relevant scenario process file, each assigned source file, and referenced local note files.',
    'Write only the sibling summary paths listed below. Do not rebuild indexes, accumulated actions, progress notes, or Inbox rows. Do not write unassigned summaries.',
    'Author every summary directly from current local source evidence. Split compound proposed actions into atomic checkboxes with short first-sentence titles and nested Purpose/Rationale bullets when supported.',
    '',
    'Assigned write paths:',
    ...batch.write_paths.map((writePath) => `- ${writePath}`),
  ].join('\n');
}

function writeManifestAndPrompts(manifest, manifestPath, dryRun) {
  const relativeManifestPath = path.relative(workspaceRoot, manifestPath).split(path.sep).join('/');
  const promptPaths = [];
  for (const batch of manifest.batches) {
    const promptPath = path.join(path.dirname(manifestPath), `${batch.batch_id}-prompt.md`);
    batch.prompt_path = path.relative(workspaceRoot, promptPath).split(path.sep).join('/');
    promptPaths.push(promptPath);
  }

  if (!dryRun) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    for (const batch of manifest.batches) {
      fs.writeFileSync(path.join(workspaceRoot, batch.prompt_path), `${promptForBatch(relativeManifestPath, batch)}\n`, 'utf8');
    }
  }
  return promptPaths;
}

function codexCommandForBatch(batch, args) {
  return ['codex', 'exec', '--model', args.model, '--file', batch.prompt_path];
}

function launchWorkers(manifest, args) {
  const results = [];
  for (const batch of manifest.batches) {
    const command = codexCommandForBatch(batch, args);
    const result = spawnSync(command[0], command.slice(1), {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    results.push({
      batch_id: batch.batch_id,
      status: result.status === 0 ? 'completed' : 'failed',
      exit_code: result.status,
      command,
    });
    if (result.status !== 0) {
      break;
    }
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const auditArgs = ['scripts/distillation-find-refresh-targets.js', `--from=${args.from}`, `--to=${args.to}`];
  if (args.team) {
    auditArgs.push(`--team=${args.team}`);
  }
  const audit = runJson(process.execPath, auditArgs);
  const manifestPath = path.resolve(workspaceRoot, args.manifest || defaultManifestPath(args));
  const manifest = buildManifest(args, audit);
  writeManifestAndPrompts(manifest, manifestPath, args.dryRun);

  const commands = manifest.batches.map((batch) => codexCommandForBatch(batch, args));
  let workerResults = [];
  if (args.runWorkers) {
    workerResults = launchWorkers(manifest, args);
  }

  const result = {
    dry_run: args.dryRun,
    manifest_path: path.relative(workspaceRoot, manifestPath).split(path.sep).join('/'),
    target_count: manifest.target_count,
    batch_count: manifest.batch_count,
    model: args.model,
    commands,
    worker_results: workerResults,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Summary remediation ${args.dryRun ? 'dry run' : 'manifest'}: ${result.target_count} target(s), ${result.batch_count} batch(es).`);
    console.log(`Manifest: ${result.manifest_path}`);
    console.log(`Model: ${result.model}`);
    for (const command of commands) {
      console.log(`- ${command.join(' ')}`);
    }
  }
}

main();
