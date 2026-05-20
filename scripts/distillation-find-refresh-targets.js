#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_FRONTMATTER_KEYS,
  REQUIRED_SUMMARY_SECTIONS,
  EVIDENCE_PREFIXES,
  STALE_PHRASES,
  parseArgs,
  buildScope,
  collectFilesBySuffix,
  readMarkdown,
  bulletValues,
  summarizeReasons,
  formatPath,
} = require('./layered-artifact-utils');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scope = buildScope(args);
  const now = new Date();
  const sourcePaths = collectFilesBySuffix(scope, '-source.md');
  const targets = [];
  const allReasons = [];

  for (const sourcePath of sourcePaths) {
    const summaryPath = sourcePath.replace(/-source\.md$/, '-summary.md');
    const reasons = [];

    if (!fs.existsSync(summaryPath)) {
      reasons.push('missing-summary');
    } else {
      const summary = readMarkdown(summaryPath);

      for (const key of REQUIRED_FRONTMATTER_KEYS) {
        if (!summary.frontmatter[key] || (Array.isArray(summary.frontmatter[key]) && summary.frontmatter[key].length === 0)) {
          reasons.push(`missing-frontmatter:${key}`);
        }
      }

      for (const section of REQUIRED_SUMMARY_SECTIONS) {
        if (!summary.sections[section]) {
          reasons.push(`missing-section:${section}`);
        }
      }

      if (!summary.sections.Evidence) {
        reasons.push('missing-evidence-section');
      } else {
        const evidenceBullets = bulletValues(summary.sections.Evidence);
        for (const prefix of EVIDENCE_PREFIXES) {
          if (!evidenceBullets.some((value) => value.startsWith(prefix))) {
            reasons.push(`missing-evidence-bullet:${prefix}`);
          }
        }
      }

      if (STALE_PHRASES.some((phrase) => summary.text.includes(phrase))) {
        reasons.push('stale-generic-phrasing');
      }

      if (summary.frontmatter.expires_at && summary.frontmatter.expires_at !== 'none') {
        const expiresAt = new Date(summary.frontmatter.expires_at);
        if (!Number.isNaN(expiresAt.getTime()) && expiresAt < now) {
          reasons.push('expired-summary');
        }
      }

    }

    if (reasons.length === 0) {
      continue;
    }

    allReasons.push(...reasons);
    targets.push({
      sourcePath: formatPath(sourcePath, scope),
      summaryPath: formatPath(summaryPath, scope),
      reasons,
    });
  }

  const result = {
    scope: {
      team: scope.team,
      year: scope.year,
      month: scope.month,
      from: args.from,
      to: args.to,
    },
    sourceFiles: sourcePaths.length,
    targets: targets.length,
    reasonCounts: summarizeReasons(allReasons),
    items: targets,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
