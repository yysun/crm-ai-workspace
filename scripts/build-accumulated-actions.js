#!/usr/bin/env node

/*
 * Builds deterministic accumulated action queue snapshots from summaries.
 *
 * Feature notes:
 * Reads `## Proposed Actions` checkboxes from sibling `*-summary.md` files,
 * carries open actions forward, emits same-day removals, and writes the daily
 * traceback report consumed by Inbox publishers. Recent change: queue rows carry
 * additive action_title and action_category fields derived from the checkbox
 * prefix, while action_text remains the original checkbox text for stable
 * history and audit compatibility.
 */

const fs = require('fs');
const path = require('path');
const {
  workspaceRoot,
  dataRoot,
  readMarkdown,
  normalizeTeamId,
  isClosedStatus,
} = require('./layered-artifact-utils');

function parseArgs(argv) {
  const args = {
    team: null,
    from: '2025-01-01',
    to: null,
    date: null,
    dryRun: false,
  };

  for (const part of argv) {
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part.startsWith('--team=')) {
      args.team = normalizeTeamId(part.slice('--team='.length));
      continue;
    }
    if (part.startsWith('--from=')) {
      args.from = part.slice('--from='.length);
      continue;
    }
    if (part.startsWith('--to=')) {
      args.to = part.slice('--to='.length);
      continue;
    }
    if (part.startsWith('--date=')) {
      args.date = part.slice('--date='.length);
    }
  }

  if (args.date) {
    args.to = args.date;
  }
  if (!args.to) {
    args.to = todayIso();
  }

  validateIsoDate(args.from, '--from');
  validateIsoDate(args.to, '--to');
  if (args.from > args.to) {
    throw new Error('--from must be on or before --to');
  }

  return args;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function validateIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

function dateParts(isoDate) {
  return {
    year: isoDate.slice(0, 4),
    month: isoDate.slice(5, 7),
    day: isoDate.slice(8, 10),
  };
}

function addDay(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

function walkFiles(dirPath, visit) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, visit);
    } else {
      visit(entryPath);
    }
  }
}

function collectSummaryPaths(teamId, fromDate, toDate) {
  const paths = [];
  walkFiles(path.join(dataRoot, teamId), (filePath) => {
    if (!filePath.endsWith('-summary.md')) {
      return;
    }
    const dated = datedObjectFromPath(filePath);
    if (!dated || dated.date < fromDate || dated.date > toDate) {
      return;
    }
    paths.push(filePath);
  });
  return paths.sort();
}

function collectClosedSourcePaths(teamId, fromDate, toDate) {
  const paths = [];
  walkFiles(path.join(dataRoot, teamId), (filePath) => {
    if (!filePath.endsWith('-source.md')) {
      return;
    }
    const dated = datedObjectFromPath(filePath);
    if (!dated || dated.date < fromDate || dated.date > toDate) {
      return;
    }
    const markdown = readMarkdown(filePath);
    if (!isClosedStatus(markdown.frontmatter.status)) {
      return;
    }
    paths.push(filePath);
  });
  return paths.sort();
}

function datedObjectFromPath(filePath) {
  const rel = toPosixRelative(filePath);
  const match = rel.match(/^data\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/(accounts|contacts)\/([^/]+)\/(?:account|contact)-([^/]+)-(summary|source)\.md$/);
  if (!match) {
    return null;
  }
  const [, teamId, year, month, day, collection, folderId, stemId, layer] = match;
  return {
    teamId,
    date: `${year}-${month}-${day}`,
    objectType: collection === 'accounts' ? 'account' : 'contact',
    objectId: stemId || folderId,
    layer,
  };
}

function extractActions(markdown) {
  const actions = [];
  for (const line of markdown.sections['Proposed Actions'] || []) {
    const match = line.match(/^- \[([ xX])\]\s+(.+)$/);
    if (!match) {
      continue;
    }
    const text = compact(match[2]);
    if (!text) {
      continue;
    }
    actions.push({
      key: normalizeAction(text),
      text,
      ...deriveActionFields(text),
      checked: match[1].toLowerCase() === 'x',
    });
  }
  return actions;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeAction(value) {
  return compact(value).toLowerCase();
}

const knownActionCategories = [
  'legal/commercial review',
  'relationship owner review',
  'source correction',
  'clarify',
  'escalate',
  'monitor',
  'recruit',
  'retain',
  'support',
];

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength - 1).trimEnd();
}

function splitActionCategory(actionText) {
  const text = compact(actionText);
  const match = text.match(/^`([^`]+)`\s*:\s*(.+)$/);
  if (!match) {
    return {
      action_category: null,
      action_instruction: text,
    };
  }

  const category = compact(match[1]).toLowerCase();
  return {
    action_category: knownActionCategories.includes(category) ? category : null,
    action_instruction: compact(match[2]) || text,
  };
}

function removePurposeClause(actionInstruction) {
  return compact(actionInstruction.replace(/\s+Purpose:\s+[\s\S]*$/i, ''));
}

function sentenceBoundaryIndex(text) {
  const value = String(text || '');
  const boundaryPattern = /[.!?](?=\s|$)/g;
  let match;
  while ((match = boundaryPattern.exec(value)) !== null) {
    const before = value.slice(0, match.index);
    if (/\b(?:[A-Z]|St|Mr|Ms|Mrs|Dr|Jr|Sr|Prof|Inc|Ltd|Co|Corp|No)$/.test(before)) {
      continue;
    }
    return match.index;
  }
  return -1;
}

function deriveActionTitle(actionText) {
  const { action_instruction: actionInstruction } = splitActionCategory(actionText);
  const withoutPurpose = removePurposeClause(actionInstruction);
  const hasPurpose = /\s+Purpose:\s+/i.test(actionInstruction);
  const boundaryIndex = hasPurpose ? -1 : sentenceBoundaryIndex(withoutPurpose);
  const candidate = boundaryIndex >= 0 ? withoutPurpose.slice(0, boundaryIndex + 1) : withoutPurpose;
  return truncate(candidate.replace(/[.!?]+$/g, ''), 160);
}

function deriveActionFields(actionText) {
  const { action_category: actionCategory } = splitActionCategory(actionText);
  return {
    action_title: deriveActionTitle(actionText),
    action_category: actionCategory,
  };
}

function objectKey(objectType, objectId, teamId = null) {
  return `${teamId || ''}:${objectType}:${objectId}`;
}

function addEvent(eventsByDate, event) {
  if (!eventsByDate.has(event.date)) {
    eventsByDate.set(event.date, []);
  }
  eventsByDate.get(event.date).push(event);
}

function indexEvents(summaryPaths, closedSourcePaths) {
  const eventsByDate = new Map();

  for (const summaryPath of summaryPaths) {
    const object = datedObjectFromPath(summaryPath);
    if (!object) {
      continue;
    }

    const markdown = readMarkdown(summaryPath);
    const status = markdown.frontmatter.status || null;
    const closesObject = isClosedStatus(status);
    const hasProposedActions = Object.prototype.hasOwnProperty.call(markdown.sections, 'Proposed Actions');
    const actions = !closesObject && hasProposedActions ? extractActions(markdown) : [];
    const openActions = actions.filter((action) => !action.checked);
    const checkedActions = actions.filter((action) => action.checked);
    const event = {
      date: object.date,
      team_id: object.teamId,
      object_type: object.objectType,
      object_id: object.objectId,
      event_order: 0,
      summary_path: toPosixRelative(summaryPath),
      source_path: null,
      source_date: markdown.frontmatter.source_date || null,
      open_actions: openActions,
      checked_actions: checkedActions,
      clears_object: closesObject || openActions.length === 0,
      removal_reason: closesObject ? 'closed-status' : !hasProposedActions ? 'no-longer-supported-by-summary' : 'replaced-by-new-summary-action',
    };

    addEvent(eventsByDate, event);
  }

  for (const sourcePath of closedSourcePaths) {
    const object = datedObjectFromPath(sourcePath);
    if (!object) {
      continue;
    }
    const markdown = readMarkdown(sourcePath);
    const event = {
      date: object.date,
      team_id: object.teamId,
      object_type: object.objectType,
      object_id: object.objectId,
      event_order: 1,
      summary_path: null,
      source_path: toPosixRelative(sourcePath),
      source_date: markdown.frontmatter.source_date || object.date,
      open_actions: [],
      checked_actions: [],
      clears_object: true,
      removal_reason: 'closed-status',
    };
    addEvent(eventsByDate, event);
  }

  for (const events of eventsByDate.values()) {
    events.sort((a, b) => {
      const left = objectKey(a.object_type, a.object_id, a.team_id);
      const right = objectKey(b.object_type, b.object_id, b.team_id);
      return left.localeCompare(right)
        || a.event_order - b.event_order
        || String(a.summary_path || a.source_path || '').localeCompare(String(b.summary_path || b.source_path || ''));
    });
  }

  return eventsByDate;
}

function applyEvent(queue, event) {
  const key = objectKey(event.object_type, event.object_id, event.team_id);
  const existing = queue.get(key) || new Map();
  const next = new Map();
  const added = [];
  const carried = [];
  const removed = [];

  if (!event.clears_object) {
    for (const action of event.open_actions) {
      const previous = existing.get(action.key);
      const row = {
        object_type: event.object_type,
        object_id: event.object_id,
        team_id: event.team_id,
        action_text: action.text,
        action_title: action.action_title,
        action_category: action.action_category,
        first_seen_date: previous ? previous.first_seen_date : event.date,
        last_seen_date: event.date,
        latest_summary_path: event.summary_path,
        source_date: event.source_date,
      };
      next.set(action.key, row);
      if (previous) {
        carried.push(row);
      } else {
        added.push(row);
      }
    }
  }

  const checkedKeys = new Set(event.checked_actions.map((action) => action.key));
  for (const [actionKey, previous] of existing) {
    if (!next.has(actionKey)) {
      removed.push({
        ...previous,
        removed_date: event.date,
        removal_reason: checkedKeys.has(actionKey) ? 'checked-or-completed' : event.removal_reason || 'replaced-by-new-summary-action',
        latest_summary_path: event.summary_path || previous.latest_summary_path || null,
        latest_source_path: event.source_path || null,
      });
    }
  }

  if (next.size > 0) {
    queue.set(key, next);
  } else {
    queue.delete(key);
  }

  return { added, carried, removed };
}

function activeActions(queue) {
  return [...queue.values()].flatMap((actions) => [...actions.values()]).sort((a, b) => {
    const objectCompare = objectKey(a.object_type, a.object_id, a.team_id).localeCompare(objectKey(b.object_type, b.object_id, b.team_id));
    return objectCompare || a.action_text.localeCompare(b.action_text);
  });
}

function outputPathForDate(teamId, isoDate) {
  const { year, month, day } = dateParts(isoDate);
  return path.join(dataRoot, teamId, 'daily-triage', year, month, day, `accumulated-actions-${isoDate}.json`);
}

function removedOutputPathForDate(teamId, isoDate) {
  const { year, month, day } = dateParts(isoDate);
  return path.join(dataRoot, teamId, 'daily-triage', year, month, day, `removed-actions-${isoDate}.json`);
}

function actionsReportOutputPathForDate(teamId, isoDate) {
  const { year, month, day } = dateParts(isoDate);
  return path.join(dataRoot, teamId, 'daily-triage', year, month, day, `actions-${isoDate}.md`);
}

function snapshotDateFromPath(filePath) {
  const rel = toPosixRelative(filePath);
  const match = rel.match(/^data\/\d+\/daily-triage\/\d{4}\/\d{2}\/\d{2}\/accumulated-actions-(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

function findBaseSnapshot(teamId, beforeDate) {
  let candidate = null;
  walkFiles(path.join(dataRoot, teamId, 'daily-triage'), (filePath) => {
    const snapshotDate = snapshotDateFromPath(filePath);
    if (!snapshotDate || snapshotDate >= beforeDate) {
      return;
    }
    if (!candidate || snapshotDate > candidate.date) {
      candidate = {
        date: snapshotDate,
        path: filePath,
      };
    }
  });
  return candidate;
}

function seedQueueFromSnapshot(snapshot) {
  const queue = new Map();
  for (const action of snapshot.active_actions || []) {
    const objectType = action.object_type;
    const objectId = String(action.object_id || '');
    const actionText = compact(action.action_text);
    if (!objectType || !objectId || !actionText) {
      continue;
    }
    const actionKey = action.action_key || normalizeAction(actionText);
    const key = objectKey(objectType, objectId, action.team_id || snapshot.team_id);
    if (!queue.has(key)) {
      queue.set(key, new Map());
    }
    queue.get(key).set(actionKey, {
      object_type: objectType,
      object_id: objectId,
      team_id: action.team_id || snapshot.team_id || null,
      action_text: actionText,
      action_title: action.action_title || deriveActionTitle(actionText),
      action_category: action.action_category || splitActionCategory(actionText).action_category,
      first_seen_date: action.first_seen_date || snapshot.start_date || snapshot.as_of_date,
      last_seen_date: action.last_seen_date || snapshot.as_of_date,
      latest_summary_path: action.latest_summary_path || null,
      source_date: action.source_date || null,
    });
  }
  return queue;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeSnapshot(teamId, isoDate, snapshot, dryRun) {
  const outputPath = outputPathForDate(teamId, isoDate);
  if (!dryRun) {
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }
  return outputPath;
}

function writeRemovedActions(teamId, isoDate, snapshot, dryRun) {
  const outputPath = removedOutputPathForDate(teamId, isoDate);
  const removed = snapshot.changes_on_date ? snapshot.changes_on_date.removed || [] : [];
  if (removed.length === 0) {
    if (!dryRun && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    return null;
  }

  const payload = {
    generated_at: snapshot.generated_at,
    start_date: snapshot.start_date,
    as_of_date: snapshot.as_of_date,
    base_snapshot: snapshot.base_snapshot,
    removed_action_count: removed.length,
    removed_actions: removed,
  };

  if (!dryRun) {
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  return outputPath;
}

function absoluteWorkspacePath(relativePath) {
  if (!relativePath) {
    return null;
  }
  return path.join(workspaceRoot, relativePath.split('/').join(path.sep));
}

function sectionText(markdown, sectionName) {
  return compactMarkdownLines(markdown && markdown.sections ? markdown.sections[sectionName] || [] : []);
}

function compactMarkdownLines(lines) {
  return (lines || [])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function accountContactTerminology(text) {
  return String(text || '')
    .replace(/\bObjects\b/g, 'Accounts and contacts')
    .replace(/\bobjects\b/g, 'accounts and contacts')
    .replace(/\bObject\b/g, 'Account/contact')
    .replace(/\bobject\b/g, 'account/contact');
}

function evidenceObject(markdown) {
  const evidence = markdown && markdown.sections ? markdown.sections.Evidence || [] : [];
  for (const line of evidence) {
    const match = line.match(/^- Object:\s+(.+)$/);
    if (match) {
      return accountContactTerminology(compact(match[1]));
    }
  }
  return null;
}

function groupActiveActions(active) {
  const groups = new Map();
  for (const action of active) {
    const key = objectKey(action.object_type, action.object_id, action.team_id);
    if (!groups.has(key)) {
      groups.set(key, {
        team_id: action.team_id || null,
        object_type: action.object_type,
        object_id: action.object_id,
        first_seen_date: action.first_seen_date || null,
        last_seen_date: action.last_seen_date || null,
        latest_summary_path: action.latest_summary_path || null,
        source_date: action.source_date || null,
        actions: [],
      });
    }
    const group = groups.get(key);
    group.actions.push(action);
    if (!group.first_seen_date || (action.first_seen_date && action.first_seen_date < group.first_seen_date)) {
      group.first_seen_date = action.first_seen_date || group.first_seen_date;
    }
    if (!group.last_seen_date || (action.last_seen_date && action.last_seen_date > group.last_seen_date)) {
      group.last_seen_date = action.last_seen_date || group.last_seen_date;
      group.latest_summary_path = action.latest_summary_path || group.latest_summary_path;
      group.source_date = action.source_date || group.source_date;
    }
  }
  return [...groups.values()].sort((a, b) => {
    const left = objectKey(a.object_type, a.object_id, a.team_id);
    const right = objectKey(b.object_type, b.object_id, b.team_id);
    return left.localeCompare(right);
  });
}

function readTracebackMarkdown(group) {
  const summaryPath = absoluteWorkspacePath(group.latest_summary_path);
  if (summaryPath && fs.existsSync(summaryPath)) {
    return readMarkdown(summaryPath);
  }
  return null;
}

function writeActionsReport(teamId, isoDate, snapshot, dryRun) {
  const outputPath = actionsReportOutputPathForDate(teamId, isoDate);
  const groups = groupActiveActions(snapshot.active_actions || []);
  const lines = [
    `# Active Accounts And Contacts Traceback - ${isoDate}`,
    '',
    '## Scope',
    '',
    `- Team ID: ${snapshot.team_id}`,
    `- As-of date: ${snapshot.as_of_date}`,
    `- Queue start date: ${snapshot.start_date}`,
    `- Active actions: ${snapshot.active_action_count}`,
    `- Active accounts and contacts: ${snapshot.active_object_count}`,
    '',
    '## Traceback Order',
    '',
    'Each active account or contact is listed as actions -> insights -> tensions -> memory.',
    '',
    '## Active Accounts And Contacts',
    '',
  ];

  groups.forEach((group, index) => {
    const markdown = readTracebackMarkdown(group);
    const accountOrContactName = evidenceObject(markdown) || `${group.object_type}:${group.object_id}`;
    const accountOrContactLabel = group.object_type === 'account' ? 'Account' : 'Contact';
    const insight = accountContactTerminology(sectionText(markdown, 'Insight'));
    const tensions = accountContactTerminology(sectionText(markdown, 'Tensions'));
    const memory = accountContactTerminology(sectionText(markdown, 'Memory'));

    lines.push(`### ${index + 1}. ${accountOrContactName}`);
    lines.push('');
    lines.push(`- Team ID: ${group.team_id || 'unknown'}`);
    lines.push(`- ${accountOrContactLabel} key: ${group.object_type}:${group.object_id}`);
    lines.push(`- First seen: ${group.first_seen_date || 'unknown'}`);
    lines.push(`- Last seen: ${group.last_seen_date || 'unknown'}`);
    lines.push(`- Source date: ${group.source_date || 'unknown'}`);
    lines.push('');
    lines.push('#### Actions');
    lines.push('');
    for (const action of group.actions.sort((a, b) => a.action_text.localeCompare(b.action_text))) {
      lines.push(`- [ ] ${accountContactTerminology(action.action_text)}`);
    }
    lines.push('');
    lines.push('#### Insight');
    lines.push('');
    lines.push(insight || '_No `Insight` section found in the latest summary artifact._');
    lines.push('');
    lines.push('#### Tensions');
    lines.push('');
    lines.push(tensions || '_No `Tensions` section found in the latest summary artifact._');
    lines.push('');
    lines.push('#### Memory');
    lines.push('');
    lines.push(memory || '_No `Memory` section found in the latest summary artifact._');
    lines.push('');
  });

  if (!dryRun) {
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  }
  return outputPath;
}

function collectTeamIds(args) {
  if (args.team) {
    return [args.team];
  }
  if (!fs.existsSync(dataRoot)) {
    return [];
  }
  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name) && !/^\d{4}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function buildTeamSnapshots(args, teamId) {
  const baseSnapshot = findBaseSnapshot(teamId, args.from);
  const base = baseSnapshot ? readJson(baseSnapshot.path) : null;
  const summaryPaths = collectSummaryPaths(teamId, args.from, args.to);
  const closedSourcePaths = collectClosedSourcePaths(teamId, args.from, args.to);
  const eventsByDate = indexEvents(summaryPaths, closedSourcePaths);
  const queue = base ? seedQueueFromSnapshot(base) : new Map();
  const written = [];
  const removedWritten = [];
  const actionsReportWritten = [];
  const totals = {
    added: 0,
    carried: 0,
    removed: 0,
  };

  for (let date = args.from; date <= args.to; date = addDay(date)) {
    const events = eventsByDate.get(date) || [];
    const changes = {
      added: [],
      carried: [],
      removed: [],
    };

    for (const event of events) {
      const result = applyEvent(queue, event);
      changes.added.push(...result.added);
      changes.carried.push(...result.carried);
      changes.removed.push(...result.removed);
    }
    totals.added += changes.added.length;
    totals.carried += changes.carried.length;
    totals.removed += changes.removed.length;

    const active = activeActions(queue);
    const snapshot = {
      generated_at: new Date().toISOString(),
      team_id: teamId,
      start_date: base && base.start_date ? base.start_date : args.from,
      as_of_date: date,
      base_snapshot: baseSnapshot ? toPosixRelative(baseSnapshot.path) : null,
      source_summary_files: events.map((event) => event.summary_path || event.source_path),
      active_action_count: active.length,
      active_object_count: new Set(active.map((action) => objectKey(action.object_type, action.object_id, action.team_id))).size,
      active_actions: active,
      changes_on_date: changes,
    };

    const outputPath = writeSnapshot(teamId, date, snapshot, args.dryRun);
    const removedOutputPath = writeRemovedActions(teamId, date, snapshot, args.dryRun);
    const actionsReportOutputPath = writeActionsReport(teamId, date, snapshot, args.dryRun);
    written.push(toPosixRelative(outputPath));
    if (removedOutputPath) {
      removedWritten.push(toPosixRelative(removedOutputPath));
    }
    actionsReportWritten.push(toPosixRelative(actionsReportOutputPath));
  }

  return {
    team_id: teamId,
    requested_start_date: args.from,
    queue_start_date: base && base.start_date ? base.start_date : args.from,
    base_snapshot: baseSnapshot ? toPosixRelative(baseSnapshot.path) : null,
    end_date: args.to,
    dry_run: args.dryRun,
    summary_files_read: summaryPaths.length,
    closed_source_files_read: closedSourcePaths.length,
    snapshots: written.length,
    removed_action_files: removedWritten.length,
    actions_report_files: actionsReportWritten.length,
    changes: totals,
    output_root: `data/${teamId}/daily-triage`,
    last_snapshot: written[written.length - 1] || null,
    last_removed_actions: removedWritten[removedWritten.length - 1] || null,
    last_actions_report: actionsReportWritten[actionsReportWritten.length - 1] || null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const teamResults = collectTeamIds(args).map((teamId) => buildTeamSnapshots(args, teamId));
  const totals = teamResults.reduce((accumulator, result) => {
    accumulator.summary_files_read += result.summary_files_read;
    accumulator.closed_source_files_read += result.closed_source_files_read;
    accumulator.snapshots += result.snapshots;
    accumulator.removed_action_files += result.removed_action_files;
    accumulator.actions_report_files += result.actions_report_files;
    accumulator.changes.added += result.changes.added;
    accumulator.changes.carried += result.changes.carried;
    accumulator.changes.removed += result.changes.removed;
    return accumulator;
  }, {
    summary_files_read: 0,
    closed_source_files_read: 0,
    snapshots: 0,
    removed_action_files: 0,
    actions_report_files: 0,
    changes: { added: 0, carried: 0, removed: 0 },
  });

  process.stdout.write(`${JSON.stringify({
    requested_team: args.team,
    requested_start_date: args.from,
    end_date: args.to,
    dry_run: args.dryRun,
    teams: teamResults.length,
    totals,
    team_results: teamResults,
  }, null, 2)}\n`);
}

main();
