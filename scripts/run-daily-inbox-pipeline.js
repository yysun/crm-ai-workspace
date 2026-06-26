#!/usr/bin/env node

/*
 * Coordinates the daily Inbox pipeline without authoring judgment.
 *
 * Feature notes:
 * Runs or plans the allowed sequence: optional CRM refresh, Codex CLI summary
 * remediation, summary audit, validation, accumulated-action rebuild, index
 * rebuild, Inbox dry-run, and optional gated live Inbox publish. This script is
 * a coordinator only; it never drafts or rewrites `*-summary.md` prose.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const workspaceRoot = path.resolve(__dirname, '..');

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = {
    date: todayIso(),
    from: null,
    team: null,
    teams: [],
    refresh: false,
    source: null,
    dryRun: true,
    live: false,
    publish: 'api',
    archiveActions: false,
    model: 'gpt-5.5-medium',
    batchSize: 100,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    const next = (label) => {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value after ${label}.`);
      }
      index += 1;
      return value;
    };
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part === '--execute') {
      args.dryRun = false;
      continue;
    }
    if (part === '--live') {
      args.live = true;
      args.dryRun = false;
      continue;
    }
    if (part === '--refresh') {
      args.refresh = true;
      continue;
    }
    if (part === '--local-only') {
      args.refresh = false;
      continue;
    }
    if (part === '--json') {
      args.json = true;
      continue;
    }
    if (part === '--archive-actions') {
      args.archiveActions = true;
      continue;
    }
    if (part === '--date') {
      args.date = next('--date');
      continue;
    }
    if (part.startsWith('--date=')) {
      args.date = part.slice('--date='.length);
      continue;
    }
    if (part === '--from') {
      args.from = next('--from');
      continue;
    }
    if (part.startsWith('--from=')) {
      args.from = part.slice('--from='.length);
      continue;
    }
    if (part === '--team') {
      args.team = next('--team');
      args.teams.push(args.team);
      continue;
    }
    if (part.startsWith('--team=')) {
      args.team = part.slice('--team='.length);
      args.teams.push(args.team);
      continue;
    }
    if (part === '--teams') {
      args.teams.push(...next('--teams').split(',').map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (part.startsWith('--teams=')) {
      args.teams.push(...part.slice('--teams='.length).split(',').map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (part === '--publish') {
      args.publish = next('--publish');
      continue;
    }
    if (part.startsWith('--publish=')) {
      args.publish = part.slice('--publish='.length);
      continue;
    }
    if (part === '--source') {
      args.source = next('--source');
      continue;
    }
    if (part.startsWith('--source=')) {
      args.source = part.slice('--source='.length);
      continue;
    }
    if (part === '--model') {
      args.model = next('--model');
      continue;
    }
    if (part.startsWith('--model=')) {
      args.model = part.slice('--model='.length);
      continue;
    }
    if (part === '--batch-size') {
      args.batchSize = Number(next('--batch-size'));
      continue;
    }
    if (part.startsWith('--batch-size=')) {
      args.batchSize = Number(part.slice('--batch-size='.length));
      continue;
    }
    throw new Error(`Unknown option: ${part}`);
  }

  if (!['api', 'sql', 'none'].includes(args.publish)) {
    throw new Error('--publish must be api, sql, or none.');
  }
  if (args.publish === 'sql' && args.teams.length === 0) {
    throw new Error('--publish=sql requires --team or --teams so cleanup scope is explicit.');
  }
  if (args.archiveActions && args.teams.length === 0) {
    throw new Error('--archive-actions requires --team or --teams so CRM Actions archive scope is explicit.');
  }
  args.from = args.from || args.date;
  args.teams = [...new Set(args.teams)];
  return args;
}

function actionReportPath(teamId, isoDate) {
  const year = isoDate.slice(0, 4);
  const month = isoDate.slice(5, 7);
  const day = isoDate.slice(8, 10);
  return `data/${teamId}/daily-triage/${year}/${month}/${day}/actions-${isoDate}.md`;
}

function command(label, argv, options = {}) {
  return {
    label,
    argv,
    writes: Boolean(options.writes),
    gate: options.gate || null,
  };
}

function envEnabled(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function runCommand(step) {
  const result = spawnSync(step.argv[0], step.argv.slice(1), {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${step.label}`);
  }
}

function runJsonStep(step, echo = true) {
  const result = spawnSync(step.argv[0], step.argv.slice(1), {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Step failed: ${step.label}`);
  }
  if (echo) {
    process.stdout.write(result.stdout || '');
  }
  return JSON.parse(result.stdout);
}

function auditTargets(args) {
  const argv = [process.execPath, 'scripts/distillation-find-refresh-targets.js', `--from=${args.from}`, `--to=${args.date}`];
  if (args.team) {
    argv.push(`--team=${args.team}`);
  }
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'distillation audit failed');
  }
  return JSON.parse(result.stdout);
}

function buildSteps(args, audit) {
  const steps = [];
  if (args.refresh) {
    const refreshArgs = [process.execPath, 'scripts/refresh-crm-data.js'];
    if (args.source) {
      refreshArgs.push(`--source=${args.source}`);
    }
    steps.push(command('refresh local CRM data', refreshArgs, { writes: true }));
  }

  const batchArgs = [
    process.execPath,
    'scripts/batch-remediate-summaries.js',
    `--from=${args.from}`,
    `--to=${args.date}`,
    `--model=${args.model}`,
    `--batch-size=${args.batchSize}`,
  ];
  if (args.team) {
    batchArgs.push(`--team=${args.team}`);
  }
  batchArgs.push(args.dryRun ? '--dry-run' : '--run-workers');
  steps.push(command(audit.targets > 0 ? 'remediate summaries with Codex CLI workers' : 'confirm no summary remediation targets', batchArgs, { writes: !args.dryRun && audit.targets > 0 }));

  const auditArgs = [process.execPath, 'scripts/distillation-find-refresh-targets.js', `--from=${args.from}`, `--to=${args.date}`];
  if (args.team) {
    auditArgs.push(`--team=${args.team}`);
  }
  steps.push(command('audit summary targets after remediation', auditArgs));

  const validateArgs = [process.execPath, 'scripts/distillation-validate-outputs.js', `--from=${args.from}`, `--to=${args.date}`];
  if (args.team) {
    validateArgs.push(`--team=${args.team}`);
  }
  steps.push(command('validate summaries', validateArgs));

  const rebuildTeams = args.teams.length > 0 ? args.teams : args.team ? [args.team] : [null];
  for (const team of rebuildTeams) {
    const actionArgs = [process.execPath, 'scripts/build-accumulated-actions.js', `--from=${args.from}`, `--to=${args.date}`];
    if (team) {
      actionArgs.push(`--team=${team}`);
    }
    if (args.dryRun) {
      actionArgs.push('--dry-run');
    }
    steps.push(command(`rebuild accumulated actions${team ? ` team ${team}` : ''}`, actionArgs, { writes: !args.dryRun }));
  }

  steps.push(command('rebuild data index', [process.execPath, 'scripts/build-data-index.js'], { writes: true }));

  if (args.publish !== 'none') {
    const publishScript = args.publish === 'sql' ? 'scripts/post-inbox-sql.js' : 'scripts/post-inbox.js';
    const dryRunArgs = [process.execPath, publishScript, `--date=${args.date}`, '--dry-run'];
    if (args.publish === 'sql') {
      dryRunArgs.push(`--teams=${args.teams.join(',')}`);
    } else if (args.teams.length > 0) {
      dryRunArgs.push(`--teams=${args.teams.join(',')}`);
    }
    dryRunArgs.push(args.publish === 'api' ? '--summary-json' : '--json');
    steps.push(command(`dry-run ${args.publish} Inbox publish`, dryRunArgs));

    const liveArgs = [process.execPath, publishScript, `--date=${args.date}`];
    if (args.publish === 'sql') {
      liveArgs.push(`--teams=${args.teams.join(',')}`);
    } else if (args.teams.length > 0) {
      liveArgs.push(`--teams=${args.teams.join(',')}`);
    }
    steps.push(command(`live ${args.publish} Inbox publish`, liveArgs, {
      writes: true,
      gate: args.publish === 'sql' ? 'AIW_ENABLE_SQL_INBOX_UPSERT' : 'AIW_ENABLE_CRM_INBOX_POST',
    }));
  }

  if (args.archiveActions) {
    for (const team of args.teams) {
      const archiveArgs = [
        process.execPath,
        'scripts/post-accumulated-actions.js',
        '--team-file',
        `--file=${actionReportPath(team, args.date)}`,
      ];
      if (args.dryRun) {
        archiveArgs.push('--dry-run');
      }
      steps.push(command(`archive CRM Actions snapshot team ${team}`, archiveArgs, {
        writes: !args.dryRun,
        gate: 'AIW_ENABLE_CRM_ACTION_POST',
      }));
    }
  }

  return steps;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = auditTargets(args);
  const steps = buildSteps(args, audit);
  const runnableSteps = args.live ? steps : steps.filter((step) => !step.label.startsWith('live '));
  const result = {
    dry_run: args.dryRun,
    live: args.live,
    refresh: args.refresh,
    date: args.date,
    from: args.from,
    publish: args.publish,
    archive_actions: args.archiveActions,
    initial_targets: audit.targets,
    commands: runnableSteps.map((step) => ({
      label: step.label,
      command: step.argv.join(' '),
      writes: step.writes,
      gate: step.gate,
    })),
  };

  if (args.dryRun) {
    const executed = [];
    const plannedOnly = [];
    for (const step of runnableSteps) {
      if (step.writes) {
        plannedOnly.push(step.label);
        continue;
      }
      if (step.label === 'audit summary targets after remediation') {
        const audit = runJsonStep(step, false);
        executed.push({ label: step.label, targets: audit.targets });
        continue;
      }
      if (step.label.startsWith('dry-run ') && step.label.endsWith(' Inbox publish')) {
        const publishDryRun = runJsonStep(step, false);
        executed.push({
          label: step.label,
          payloads: publishDryRun.count || publishDryRun.payloads || 0,
          contract_warning_count: publishDryRun.contract_warning_count || 0,
        });
        continue;
      }
      runCommand(step);
      executed.push({ label: step.label });
    }
    result.executed = executed;
    result.planned_only = plannedOnly;
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Daily Inbox pipeline dry run for ${args.date}. Initial targets: ${audit.targets}.`);
      for (const step of result.commands) {
        console.log(`- ${step.label}: ${step.command}`);
      }
      if (plannedOnly.length > 0) {
        console.log(`Planned only: ${plannedOnly.join(', ')}`);
      }
    }
    return;
  }

  for (const step of runnableSteps) {
    if (step.gate && !envEnabled(step.gate)) {
      throw new Error(`Live publish blocked: missing ${step.gate}. Dry-run completed before this gate.`);
    }
    if (step.label === 'audit summary targets after remediation') {
      const audit = runJsonStep(step);
      if (audit.targets > 0) {
        throw new Error(`Summary audit still has ${audit.targets} target(s); stopping before validation, rebuild, or posting.`);
      }
      continue;
    }
    if (step.label.startsWith('dry-run ') && step.label.endsWith(' Inbox publish')) {
      const publishDryRun = runJsonStep(step, false);
      if ((publishDryRun.contract_warning_count || 0) > 0) {
        throw new Error(`Inbox dry-run has ${publishDryRun.contract_warning_count} contract warning(s); stopping before live publish.`);
      }
      continue;
    }
    if (step.label === 'live api Inbox publish' || step.label === 'live sql Inbox publish' || !step.label.startsWith('live ')) {
      runCommand(step);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ ...result, completed: true }, null, 2));
  } else {
    console.log(`Daily Inbox pipeline completed for ${args.date}.`);
  }
}

main();
