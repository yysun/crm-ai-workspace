#!/usr/bin/env node
/*
 * Validates structural requirements for agent-authored summary.md artifacts.
 * This script checks shape, traceability bullets, stale phrasing, source file
 * existence, and forbidden top-level action metadata headings; semantic
 * judgment still requires process review and eval contract cases.
 */

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_FRONTMATTER_KEYS,
  REQUIRED_SUMMARY_SECTIONS,
  DISALLOWED_SUMMARY_SECTIONS,
  EVIDENCE_PREFIXES,
  STALE_PHRASES,
  parseArgs,
  buildScope,
  collectFilesBySuffix,
  readMarkdown,
  bulletValues,
  summarizeReasons,
  formatPath,
  workspaceRoot,
} = require('./layered-artifact-utils');

function validateSummary(summaryPath, scope) {
  const errors = [];
  const summary = readMarkdown(summaryPath);

  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    const value = summary.frontmatter[key];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      errors.push(`missing frontmatter key ${key}`);
    }
  }

  for (const section of REQUIRED_SUMMARY_SECTIONS) {
    if (!summary.sections[section]) {
      errors.push(`missing required section ${section}`);
    }
  }

  for (const section of DISALLOWED_SUMMARY_SECTIONS) {
    if (summary.sections[section]) {
      errors.push(`disallowed top-level section ${section}`);
    }
  }

  if (summary.sections.Evidence) {
    const evidenceBullets = bulletValues(summary.sections.Evidence);
    for (const prefix of EVIDENCE_PREFIXES) {
      if (!evidenceBullets.some((value) => value.startsWith(prefix))) {
        errors.push(`missing Evidence bullet ${prefix}`);
      }
    }
  }

  if (STALE_PHRASES.some((phrase) => summary.text.includes(phrase))) {
    errors.push('contains stale generic distillation phrasing');
  }

  if (Array.isArray(summary.frontmatter.source_files)) {
    for (const relativePath of summary.frontmatter.source_files) {
      const absolutePath = path.resolve(workspaceRoot, String(relativePath));
      if (!fs.existsSync(absolutePath)) {
        errors.push(`missing source file ${relativePath}`);
      }
    }
  }

  return {
    path: formatPath(summaryPath, scope),
    errors,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scope = buildScope(args);
  const summaryPaths = collectFilesBySuffix(scope, '-summary.md');

  const summaryResults = summaryPaths.map((summaryPath) => validateSummary(summaryPath, scope));
  const failures = summaryResults.filter((item) => item.errors.length > 0);
  const allReasons = failures.flatMap((item) => item.errors);
  const result = {
    scope: {
      team: scope.team,
      year: scope.year,
      month: scope.month,
      from: args.from,
      to: args.to,
    },
    summaryFiles: summaryPaths.length,
    failures: failures.length,
    errorCounts: summarizeReasons(allReasons),
    items: failures,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
