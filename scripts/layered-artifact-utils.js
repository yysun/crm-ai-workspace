const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(workspaceRoot, 'data');

const REQUIRED_FRONTMATTER_KEYS = [
  'team_id',
  'created_at',
  'updated_at',
  'ttl',
  'expires_at',
  'status',
  'source_date',
  'source_files',
];

const REQUIRED_SUMMARY_SECTIONS = ['Memory', 'Evidence', 'Confidence', 'Review Notes'];
const EVIDENCE_PREFIXES = ['Source files:', 'Object:', 'Coverage window:', 'Missing or unresolved:'];
const STALE_PHRASES = [
  'live but incomplete decision window',
  'The relationship appears active, but diligence and next-step completion remain unresolved',
];

function parseArgs(argv) {
  const args = {
    team: null,
    year: null,
    month: null,
    from: null,
    to: null,
    absolutePaths: false,
  };

  for (const part of argv) {
    if (part === '--absolute-paths') {
      args.absolutePaths = true;
      continue;
    }
    if (part.startsWith('--team=')) {
      args.team = normalizeTeamId(part.slice('--team='.length));
      continue;
    }
    if (part.startsWith('--year=')) {
      args.year = part.slice('--year='.length);
      continue;
    }
    if (part.startsWith('--month=')) {
      args.month = part.slice('--month='.length).padStart(2, '0');
      continue;
    }
    if (part.startsWith('--from=')) {
      args.from = part.slice('--from='.length);
      continue;
    }
    if (part.startsWith('--to=')) {
      args.to = part.slice('--to='.length);
    }
  }

  return args;
}

function normalizeTeamId(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) {
    return null;
  }
  return text === '-1' ? '0' : text;
}

function isTeamRootName(value) {
  const text = String(value || '');
  return /^\d+$/.test(text) && !/^\d{4}$/.test(text);
}

function parseIsoDay(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
}

function buildScope(args) {
  return {
    team: normalizeTeamId(args.team),
    year: args.year,
    month: args.month,
    from: parseIsoDay(args.from),
    to: parseIsoDay(args.to),
    absolutePaths: args.absolutePaths,
  };
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/');
}

function formatPath(filePath, scope) {
  return scope.absolutePaths ? filePath : toPosixRelative(filePath);
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

function matchesScope(filePath, scope) {
  const rel = toPosixRelative(filePath);
  const match = rel.match(/^data\/(\d+)\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!match) {
    return false;
  }
  const [, team, year, month, day] = match;
  if (scope.team && scope.team !== team) {
    return false;
  }
  if (scope.year && scope.year !== year) {
    return false;
  }
  if (scope.month && scope.month !== month) {
    return false;
  }
  if (!scope.from && !scope.to) {
    return true;
  }
  const current = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (scope.from && current < scope.from) {
    return false;
  }
  if (scope.to && current > scope.to) {
    return false;
  }
  return true;
}

function collectFilesBySuffix(scope, suffix) {
  const roots = [];
  const teamRoots = scope.team
    ? [path.join(dataRoot, scope.team)]
    : fs.existsSync(dataRoot)
      ? fs.readdirSync(dataRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isTeamRootName(entry.name))
        .map((entry) => path.join(dataRoot, entry.name))
        .sort()
      : [];

  if (scope.year) {
    for (const teamRoot of teamRoots) {
      roots.push(scope.month ? path.join(teamRoot, scope.year, scope.month) : path.join(teamRoot, scope.year));
    }
  } else {
    roots.push(...teamRoots);
  }

  const files = [];
  for (const root of roots) {
    walkFiles(root, (filePath) => {
      if (!filePath.endsWith(suffix)) {
        return;
      }
      if (!matchesScope(filePath, scope)) {
        return;
      }
      files.push(filePath);
    });
  }

  return files.sort();
}

function unquote(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    return { frontmatter: {}, body: text };
  }
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const frontmatter = {};
  let currentArrayKey = null;

  for (const rawLine of match[1].split('\n')) {
    if (/^\s*$/.test(rawLine)) {
      continue;
    }
    const arrayMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentArrayKey) {
      frontmatter[currentArrayKey].push(unquote(arrayMatch[1]));
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
      frontmatter[key] = unquote(value);
      currentArrayKey = null;
    }
  }

  return {
    frontmatter,
    body: text.slice(match[0].length),
  };
}

function parseSections(body) {
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

function readMarkdown(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(text);
  return {
    path: filePath,
    text,
    frontmatter,
    body,
    sections: parseSections(body),
  };
}

function bulletValues(lines) {
  return (lines || [])
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

function hasProposedActions(artifact) {
  return Object.prototype.hasOwnProperty.call(artifact.sections, 'Proposed Actions');
}

function summarizeReasons(reasons) {
  const counts = {};
  for (const reason of reasons) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

module.exports = {
  REQUIRED_FRONTMATTER_KEYS,
  REQUIRED_SUMMARY_SECTIONS,
  EVIDENCE_PREFIXES,
  STALE_PHRASES,
  workspaceRoot,
  dataRoot,
  normalizeTeamId,
  parseArgs,
  buildScope,
  collectFilesBySuffix,
  readMarkdown,
  bulletValues,
  hasProposedActions,
  summarizeReasons,
  formatPath,
};
