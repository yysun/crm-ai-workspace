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
const { spawn, spawnSync } = require('child_process');
const {
  workspaceRoot,
  readMarkdown,
  isExcludedSource,
  formatPath,
} = require('./layered-artifact-utils');

const defaultModel = 'gpt-5.5-medium';
const envFilePath = path.join(workspaceRoot, '.env');

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
    reasoningEffort: null,
    manifest: null,
    dryRun: false,
    runWorkers: false,
    parallel: 1,
    inboxSql: false,
    workDate: null,
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
    if (part === '--inbox-sql') {
      args.inboxSql = true;
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
    if (part === '--reasoning-effort') {
      args.reasoningEffort = readValue('--reasoning-effort');
      continue;
    }
    if (part.startsWith('--reasoning-effort=')) {
      args.reasoningEffort = part.slice('--reasoning-effort='.length);
      continue;
    }
    if (part === '--work-date') {
      args.workDate = readValue('--work-date');
      continue;
    }
    if (part.startsWith('--work-date=')) {
      args.workDate = part.slice('--work-date='.length);
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

  if (!args.inboxSql && (!args.from || !args.to)) {
    throw new Error('Pass --from=YYYY-MM-DD and --to=YYYY-MM-DD.');
  }
  if (args.inboxSql && (args.from || args.to || args.team)) {
    throw new Error('--inbox-sql builds scope from dbo.Inbox; do not combine it with --from, --to, or --team.');
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
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
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
    if (!process.env[key]) {
      process.env[key] = parseEnvValue(normalized.slice(equalsIndex + 1));
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  const { year, month, day } = dateParts(args.workDate || args.to);
  const suffix = args.team ? `team-${args.team}-` : '';
  const scope = args.inboxSql ? 'inbox-sql-current' : `${args.from}-to-${args.to}`;
  return path.join(workspaceRoot, 'my-work', year, month, day, `summary-remediation-${suffix}${scope}.json`);
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
    'Read AGENTS.md, process/distillation.md, process/summary.md, process/action.md, process/memory.md, process/tension.md, process/insight.md, the object overlay for each assigned source, any relevant scenario process file, each assigned source file, and referenced local note files.',
    'Write only the sibling summary paths listed below. Do not rebuild indexes, accumulated actions, progress notes, or Inbox rows. Do not write unassigned summaries.',
    'Author every summary directly from current local source evidence. Split compound proposed actions into atomic checkboxes with short first-sentence titles and nested Purpose/Rationale bullets when supported.',
    'Preserve existing checked checkbox state only when the same supported action still exists. Do not create summaries for inactive or closed source snapshots.',
    'When finished, report how many assigned summaries were written, skipped, or blocked.',
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
  const command = ['codex', 'exec', '--model', args.model];
  if (args.reasoningEffort) {
    command.push('-c', `model_reasoning_effort="${args.reasoningEffort}"`);
  }
  command.push('--cd', workspaceRoot, '--dangerously-bypass-approvals-and-sandbox');
  return command;
}

function launchOneWorker(batch, args) {
  return new Promise((resolve) => {
    const command = codexCommandForBatch(batch, args);
    const prompt = fs.readFileSync(path.join(workspaceRoot, batch.prompt_path), 'utf8');
    const logPath = path.join(workspaceRoot, path.dirname(batch.prompt_path), `${batch.batch_id}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const child = spawn(command[0], command.slice(1), {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end(prompt);
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on('close', (code) => {
      logStream.end();
      resolve({
        batch_id: batch.batch_id,
        status: code === 0 ? 'completed' : 'failed',
        exit_code: code,
        command,
        log_path: path.relative(workspaceRoot, logPath).split(path.sep).join('/'),
      });
    });
  });
}

async function launchWorkers(manifest, args) {
  const results = [];
  const pending = [...manifest.batches];
  const limit = Math.min(args.parallel, pending.length);
  let failed = false;

  async function runner() {
    while (pending.length > 0 && !failed) {
      const batch = pending.shift();
      const result = await launchOneWorker(batch, args);
      results.push(result);
      if (result.status !== 'completed') {
        failed = true;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runner()));
  return results;
}

function getSqlConfig() {
  loadDotEnv(envFilePath);
  return {
    server: requireEnv('SQL_SERVER'),
    database: requireEnv('SQL_DATABASE'),
    user: requireEnv('SQL_USER'),
    password: requireEnv('SQL_PASSWORD'),
    options: {
      encrypt: process.env.SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE !== 'false',
    },
  };
}

async function buildInboxSqlAudit() {
  let sql;
  try {
    sql = require('mssql');
  } catch {
    throw new Error('Missing dependency: mssql. Run npm install from the workspace root.');
  }

  const pool = await sql.connect(getSqlConfig());
  try {
    const result = await pool.request().query(`
      SELECT
        SourceSummaryPath AS summaryPath,
        COUNT(*) AS inboxRows,
        MIN(TeamId) AS minTeamId,
        MAX(TeamId) AS maxTeamId,
        MIN(SourceDate) AS minSourceDate,
        MAX(SourceDate) AS maxSourceDate
      FROM dbo.Inbox
      WHERE SourceSummaryPath IS NOT NULL
        AND LTRIM(RTRIM(SourceSummaryPath)) <> ''
      GROUP BY SourceSummaryPath
      ORDER BY SourceSummaryPath;
    `);
    const items = [];
    const excluded = [];
    const missingSources = [];
    const rows = result.recordset || [];

    for (const row of rows) {
      const summaryPath = String(row.summaryPath || '').trim().replace(/\\/g, '/');
      const sourcePath = summaryPath.replace(/-summary\.md$/, '-source.md');
      const absoluteSourcePath = path.join(workspaceRoot, sourcePath);
      if (!sourcePath.endsWith('-source.md') || !fs.existsSync(absoluteSourcePath)) {
        missingSources.push({ sourcePath, summaryPath, inboxRows: row.inboxRows });
        continue;
      }
      const source = readMarkdown(absoluteSourcePath);
      if (isExcludedSource(source)) {
        excluded.push({
          sourcePath,
          summaryPath,
          status: source.frontmatter.status || null,
          inboxRows: row.inboxRows,
        });
        continue;
      }
      items.push({
        sourcePath,
        summaryPath,
        reasons: ['inbox-row-remediation'],
        inboxRows: row.inboxRows,
        minTeamId: row.minTeamId,
        maxTeamId: row.maxTeamId,
        minSourceDate: row.minSourceDate,
        maxSourceDate: row.maxSourceDate,
      });
    }

    return {
      scope: {
        source: 'dbo.Inbox',
        team: null,
        year: null,
        month: null,
        from: null,
        to: null,
      },
      sourceFiles: rows.length,
      eligibleSourceFiles: items.length,
      excludedSourceFiles: excluded.length,
      targets: items.length,
      reasonCounts: { 'inbox-row-remediation': items.length },
      excluded,
      missingSources,
      items,
    };
  } finally {
    await pool.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = args.inboxSql
    ? await buildInboxSqlAudit()
    : (() => {
      const auditArgs = ['scripts/distillation-find-refresh-targets.js', `--from=${args.from}`, `--to=${args.to}`];
      if (args.team) {
        auditArgs.push(`--team=${args.team}`);
      }
      return runJson(process.execPath, auditArgs);
    })();
  const manifestPath = path.resolve(workspaceRoot, args.manifest || defaultManifestPath(args));
  const manifest = buildManifest(args, audit);
  manifest.inbox_sql_missing_sources = audit.missingSources || [];
  writeManifestAndPrompts(manifest, manifestPath, args.dryRun);

  const commands = manifest.batches.map((batch) => codexCommandForBatch(batch, args));
  let workerResults = [];
  if (args.runWorkers) {
    workerResults = await launchWorkers(manifest, args);
  }

  const result = {
    dry_run: args.dryRun,
    manifest_path: path.relative(workspaceRoot, manifestPath).split(path.sep).join('/'),
    target_count: manifest.target_count,
    batch_count: manifest.batch_count,
    model: args.model,
    reasoning_effort: args.reasoningEffort,
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
