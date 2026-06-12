#!/usr/bin/env node

const path = require('path');
const {
  parseArgs,
  buildScope,
  collectFilesBySuffix,
  readMarkdown,
  isExcludedSource,
  formatPath,
  workspaceRoot,
} = require('./layered-artifact-utils');

function parseLocalArgs(argv) {
  const args = parseArgs(argv);
  args.limit = 100;
  args.offset = 0;
  args.missingOnly = false;
  args.includeExcluded = false;

  for (const part of argv) {
    if (part.startsWith('--limit=')) {
      args.limit = Math.max(1, Number(part.slice('--limit='.length)) || 100);
      continue;
    }
    if (part.startsWith('--offset=')) {
      args.offset = Math.max(0, Number(part.slice('--offset='.length)) || 0);
      continue;
    }
    if (part === '--missing-only') {
      args.missingOnly = true;
      continue;
    }
    if (part === '--include-excluded') {
      args.includeExcluded = true;
    }
  }

  return args;
}

function summaryPathFor(sourcePath) {
  return sourcePath.replace(/-source\.md$/, '-summary.md');
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function objectName(markdown) {
  const lines = markdown.sections['Object Snapshot'] || [];
  for (const line of lines) {
    const match = line.match(/^- Primary object:\s+(.+)$/);
    if (match) {
      return compact(match[1]).replace(/\.$/, '');
    }
  }
  return `${markdown.frontmatter.object_type || 'object'} ${markdown.frontmatter.object_id || ''}`.trim();
}

function main() {
  const args = parseLocalArgs(process.argv.slice(2));
  const scope = buildScope(args);
  const allSourcePaths = collectFilesBySuffix(scope, '-source.md');
  const excluded = [];
  let sourcePaths = [];

  for (const sourcePath of allSourcePaths) {
    const markdown = readMarkdown(sourcePath);
    if (!args.includeExcluded && isExcludedSource(markdown)) {
      excluded.push({
        source_path: formatPath(sourcePath, scope),
        status: markdown.frontmatter.status || null,
      });
      continue;
    }
    sourcePaths.push(sourcePath);
  }

  if (args.missingOnly) {
    sourcePaths = sourcePaths.filter((sourcePath) => !require('fs').existsSync(summaryPathFor(sourcePath)));
  }

  const selected = sourcePaths.slice(args.offset, args.offset + args.limit);
  const items = selected.map((sourcePath) => {
    const markdown = readMarkdown(sourcePath);
    return {
      source_path: formatPath(sourcePath, scope),
      summary_path: formatPath(summaryPathFor(sourcePath), scope),
      team_id: markdown.frontmatter.team_id || null,
      object_type: markdown.frontmatter.object_type || null,
      object_id: markdown.frontmatter.object_id || null,
      source_date: markdown.frontmatter.source_date || null,
      object_name: objectName(markdown),
    };
  });

  process.stdout.write(`${JSON.stringify({
    scope: {
      team: scope.team,
      year: scope.year,
      month: scope.month,
      from: args.from,
      to: args.to,
    },
    total_source_files: allSourcePaths.length,
    excluded_sources: excluded.length,
    total_sources: sourcePaths.length,
    offset: args.offset,
    limit: args.limit,
    returned: items.length,
    next_offset: args.offset + items.length < sourcePaths.length ? args.offset + items.length : null,
    items,
    note: 'This script only loads a batch. It does not create or modify summaries.',
  }, null, 2)}\n`);
}

main();
