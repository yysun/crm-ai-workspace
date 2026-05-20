#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  REQUIRED_FRONTMATTER_KEYS,
  REQUIRED_SUMMARY_SECTIONS,
  EVIDENCE_PREFIXES,
  workspaceRoot,
} = require('./layered-artifact-utils');

const BLOCK_RE = /<!-- summary-target:\s*([^\s]+)\s*-->\n```markdown\n([\s\S]*?)\n```\n<!-- \/summary-target -->/g;

function usage() {
  process.stdout.write(`Usage:
  node scripts/split-agent-authored-summaries.js --input=my-work/YYYY/MM/DD/batch.md [--dry-run] [--overwrite]

Batch format:
<!-- summary-target: data/6/2025/05/16/accounts/2134/account-2134-summary.md -->
\`\`\`markdown
---
team_id: 6
object_type: accounts
object_id: 2134
layer: summary
created_at: 2026-05-20T19:00:00.000Z
updated_at: 2026-05-20T19:00:00.000Z
ttl: P3D
expires_at: 2026-05-23T19:00:00.000Z
status: active
source_date: 2025-05-16
source_files:
  - data/6/2025/05/16/accounts/2134/account-2134-source.md
---

## Memory

- Agent-authored summary content.

## Evidence

- Source files: data/6/2025/05/16/accounts/2134/account-2134-source.md.
- Object: account 2134, Coldwell Banker Commercial Integrity.
- Coverage window: 2025-05-16 source snapshot.
- Missing or unresolved: Unknowns.

## Confidence

Medium

## Review Notes

- Agent-authored review note.
\`\`\`
<!-- /summary-target -->

This script only splits complete agent-authored Markdown blocks byte-for-byte.
It does not synthesize, rewrite, fill fields, or create action.md files.
`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    dryRun: false,
    overwrite: false,
  };

  for (const part of argv) {
    if (part === '--help' || part === '-h') {
      args.help = true;
      continue;
    }
    if (part === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (part === '--overwrite') {
      args.overwrite = true;
      continue;
    }
    if (part.startsWith('--input=')) {
      args.input = part.slice('--input='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${part}`);
  }

  return args;
}

function toWorkspacePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || normalized.includes('\0')) {
    throw new Error(`Target must be a relative workspace path: ${relativePath}`);
  }
  const absolutePath = path.resolve(workspaceRoot, normalized);
  if (!absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error(`Target escapes workspace: ${relativePath}`);
  }
  return { relativePath: normalized, absolutePath };
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {};
  }

  const frontmatter = {};
  let currentArrayKey = null;
  for (const rawLine of match[1].split('\n')) {
    if (/^\s*$/.test(rawLine)) {
      continue;
    }
    const arrayMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentArrayKey) {
      frontmatter[currentArrayKey].push(arrayMatch[1].trim());
      continue;
    }
    const keyMatch = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) {
      currentArrayKey = null;
      continue;
    }
    const [, key, value] = keyMatch;
    if (value === '') {
      frontmatter[key] = [];
      currentArrayKey = key;
    } else {
      frontmatter[key] = value.trim();
      currentArrayKey = null;
    }
  }
  return frontmatter;
}

function parseSections(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const sections = {};
  let current = null;
  for (const line of body.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      current = match[1].trim();
      sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}

function bulletValues(lines) {
  return (lines || [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

function validateTargetPath(relativePath, frontmatter) {
  const targetMatch = relativePath.match(/^data\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\/(accounts|contacts)\/(\d+)\/(account|contact)-(\d+)-summary\.md$/);
  if (!targetMatch) {
    throw new Error(`Invalid summary target path: ${relativePath}`);
  }

  const [, teamId, year, month, day, objectTypePath, objectIdPath, nameType, nameId] = targetMatch;
  const expectedObjectType = nameType === 'account' ? 'accounts' : 'contacts';
  if (objectTypePath !== expectedObjectType || objectIdPath !== nameId) {
    throw new Error(`Target path object mismatch: ${relativePath}`);
  }
  if (String(frontmatter.team_id) !== teamId) {
    throw new Error(`team_id does not match target path for ${relativePath}`);
  }
  if (String(frontmatter.object_type) !== objectTypePath) {
    throw new Error(`object_type does not match target path for ${relativePath}`);
  }
  if (String(frontmatter.object_id) !== objectIdPath) {
    throw new Error(`object_id does not match target path for ${relativePath}`);
  }
  if (String(frontmatter.source_date) !== `${year}-${month}-${day}`) {
    throw new Error(`source_date does not match target path date for ${relativePath}`);
  }

  const expectedSource = relativePath.replace(/-summary\.md$/, '-source.md');
  if (!Array.isArray(frontmatter.source_files) || !frontmatter.source_files.includes(expectedSource)) {
    throw new Error(`source_files must include ${expectedSource}`);
  }
  const sourcePath = path.resolve(workspaceRoot, expectedSource);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file for ${relativePath}: ${expectedSource}`);
  }
}

function validateSummary(relativePath, text) {
  if (!text.startsWith('---\n')) {
    throw new Error(`Summary block missing frontmatter: ${relativePath}`);
  }
  if (relativePath.endsWith('-action.md')) {
    throw new Error(`Refusing to write action.md target: ${relativePath}`);
  }

  const frontmatter = parseFrontmatter(text);
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    const value = frontmatter[key];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      throw new Error(`Missing frontmatter key ${key} in ${relativePath}`);
    }
  }
  validateTargetPath(relativePath, frontmatter);

  const sections = parseSections(text);
  for (const section of REQUIRED_SUMMARY_SECTIONS) {
    if (!sections[section]) {
      throw new Error(`Missing required section ${section} in ${relativePath}`);
    }
  }
  const evidenceBullets = bulletValues(sections.Evidence);
  for (const prefix of EVIDENCE_PREFIXES) {
    if (!evidenceBullets.some((value) => value.startsWith(prefix))) {
      throw new Error(`Missing Evidence bullet ${prefix} in ${relativePath}`);
    }
  }
}

function parseBlocks(batchText) {
  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = BLOCK_RE.exec(batchText)) !== null) {
    const gap = batchText.slice(lastIndex, match.index);
    if (gap.trim()) {
      throw new Error('Batch file contains content outside summary blocks');
    }
    const [, target, content] = match;
    blocks.push({ target, content: `${content.trimEnd()}\n` });
    lastIndex = BLOCK_RE.lastIndex;
  }

  const trailing = batchText.slice(lastIndex);
  if (trailing.trim()) {
    throw new Error('Batch file contains trailing content outside summary blocks');
  }
  if (blocks.length === 0) {
    throw new Error('No summary blocks found');
  }

  return blocks;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.input) {
    usage();
    process.exitCode = 1;
    return;
  }

  const inputPath = path.resolve(workspaceRoot, args.input);
  if (!inputPath.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error(`Input escapes workspace: ${args.input}`);
  }

  const batchText = fs.readFileSync(inputPath, 'utf8');
  const blocks = parseBlocks(batchText);
  const seen = new Set();
  const results = [];

  for (const block of blocks) {
    const { relativePath, absolutePath } = toWorkspacePath(block.target);
    if (seen.has(relativePath)) {
      throw new Error(`Duplicate target path: ${relativePath}`);
    }
    seen.add(relativePath);
    validateSummary(relativePath, block.content);
    if (fs.existsSync(absolutePath) && !args.overwrite) {
      throw new Error(`Target already exists; pass --overwrite to replace: ${relativePath}`);
    }
    results.push({ relativePath, absolutePath, bytes: Buffer.byteLength(block.content, 'utf8') });
  }

  if (!args.dryRun) {
    for (const result of results) {
      fs.mkdirSync(path.dirname(result.absolutePath), { recursive: true });
      fs.writeFileSync(result.absolutePath, blocks.find((block) => block.target === result.relativePath).content, 'utf8');
    }
  }

  process.stdout.write(`${JSON.stringify({
    input: path.relative(workspaceRoot, inputPath).split(path.sep).join('/'),
    dry_run: args.dryRun,
    overwrite: args.overwrite,
    written: args.dryRun ? 0 : results.length,
    validated: results.length,
    targets: results.map((result) => ({ path: result.relativePath, bytes: result.bytes })),
    note: 'Splitter copied only complete agent-authored summary blocks. It did not synthesize or rewrite content.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
