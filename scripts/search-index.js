#!/usr/bin/env node

/*
 * Features: searches the generated local CRM routing index without calling the CRM
 * API, using exact name lookup first and token fallback when needed.
 * Implementation notes: results are routing aids only; read referenced source,
 * and summary files before making franchise judgments.
 * Recent changes: added agent-oriented output with confidence, read-next files,
 * synthesis gates, source-generation hints, and API escalation reasons.
 */

const fs = require('fs');
const path = require('path');
const { normalizeTeamId } = require('./layered-artifact-utils');

const workspaceRoot = path.resolve(__dirname, '..');
const indexRoot = path.join(workspaceRoot, 'data', 'index');
const validTypes = new Set(['accounts', 'contacts']);

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLookupTerm(value) {
  return compact(value).toLowerCase();
}

function tokenizeLookupTerm(value) {
  return normalizeLookupTerm(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(indexRoot, relativePath), 'utf8'));
}

function readJsonl(relativePath) {
  const filePath = path.join(indexRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseArgs(argv) {
  const args = {
    queryParts: [],
    type: null,
    team: null,
    hasSource: false,
    hasOpenAction: false,
    json: false,
    agent: false,
    paths: false,
    limit: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];

    if (part === '--help' || part === '-h') {
      args.help = true;
      continue;
    }

    if (part === '--json') {
      args.json = true;
      continue;
    }

    if (part === '--agent') {
      args.agent = true;
      continue;
    }

    if (part === '--paths') {
      args.paths = true;
      continue;
    }

    if (part === '--has-source') {
      args.hasSource = true;
      continue;
    }

    if (part.startsWith('--team=')) {
      args.team = normalizeTeamId(part.slice('--team='.length));
      continue;
    }

    if (part === '--has-open-action') {
      args.hasOpenAction = true;
      continue;
    }

    if (part === '--type' || part === '-t') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --type.');
      }
      args.type = normalizeType(value);
      index += 1;
      continue;
    }

    if (part.startsWith('--type=')) {
      args.type = normalizeType(part.slice('--type='.length));
      continue;
    }

    if (part === '--limit') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --limit.');
      }
      args.limit = parseLimit(value);
      index += 1;
      continue;
    }

    if (part.startsWith('--limit=')) {
      args.limit = parseLimit(part.slice('--limit='.length));
      continue;
    }

    if (part.startsWith('-')) {
      throw new Error(`Unknown option: ${part}`);
    }

    args.queryParts.push(part);
  }

  args.query = args.queryParts.join(' ').trim();
  return args;
}

function normalizeType(value) {
  const normalized = normalizeLookupTerm(value);
  const type = normalized === 'account' ? 'accounts' : normalized === 'contact' ? 'contacts' : normalized;
  if (!validTypes.has(type)) {
    throw new Error(`Invalid --type value "${value}". Use accounts or contacts.`);
  }
  return type;
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer.');
  }
  return limit;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/search-index.js "Royal LePage Next Level"
  node scripts/search-index.js "Next Level" --type=accounts --has-source
  node scripts/search-index.js "Jazz Gill" --json
  node scripts/search-index.js "Jazz Gill" --agent
  node scripts/search-index.js "Burloak" --paths

Options:
  -t, --type          Filter to accounts or contacts
  --has-source        Only show entities with a generated source file
  --has-open-action   Only show entities with current open actions
  --team              Filter to a workspace team id. CRM team -1 is team 0.
  --agent             Print compact agent-facing JSON with next-step decisions
  --paths             Print source/summary paths for quick file opening
  --limit             Maximum results to print. Default: 20
  --json              Print machine-readable results
`);
}

function entityKey(row) {
  return `${row.team_id}:${row.object_type}:${row.object_id}`;
}

function buildEntityMap(entities) {
  return new Map(entities.map((entity) => [entityKey(entity), entity]));
}

function mergeRows(rows, entityMap, match) {
  const merged = new Map();

  for (const row of rows) {
    const key = entityKey(row);
    const entity = entityMap.get(key) || row;
    const previous = merged.get(key);
    const next = {
      ...entity,
      match_type: match.type,
      match_score: match.score,
      matched_terms: [...new Set([...(previous ? previous.matched_terms : []), ...(match.terms || [])])],
      matched_tokens: [...new Set([...(previous ? previous.matched_tokens : []), ...(match.tokens || [])])],
    };
    if (!previous || compareRows(next, previous) < 0) {
      merged.set(key, next);
    } else {
      previous.matched_terms = next.matched_terms;
      previous.matched_tokens = next.matched_tokens;
    }
  }

  return [...merged.values()];
}

function searchExact(namesIndex, term, entityMap) {
  const rows = namesIndex[term] || [];
  return mergeRows(rows, entityMap, {
    type: 'exact',
    score: 100,
    terms: [term],
  });
}

function searchTokens(tokensIndex, queryTokens, entityMap) {
  const candidateScores = new Map();

  for (const token of queryTokens) {
    for (const row of tokensIndex[token] || []) {
      const key = entityKey(row);
      const previous = candidateScores.get(key) || {
        row,
        score: 0,
        tokens: [],
        terms: [],
      };
      previous.score += 10;
      previous.tokens.push(token);
      if (row.matched_term) {
        previous.terms.push(row.matched_term);
      }
      candidateScores.set(key, previous);
    }
  }

  const minimumScore = queryTokens.length > 1 ? 20 : 10;
  const rows = [];
  for (const candidate of candidateScores.values()) {
    if (candidate.score >= minimumScore) {
      rows.push(...mergeRows([candidate.row], entityMap, {
        type: 'token',
        score: candidate.score,
        tokens: candidate.tokens,
        terms: candidate.terms,
      }));
    }
  }

  return rows;
}

function searchContainingTerms(namesIndex, term, entityMap) {
  if (term.length < 3) {
    return [];
  }

  const rows = [];
  for (const [candidateTerm, matches] of Object.entries(namesIndex)) {
    if (!candidateTerm.includes(term)) {
      continue;
    }
    rows.push(...mergeRows(matches, entityMap, {
      type: 'contains',
      score: 5,
      terms: [candidateTerm],
    }));
  }
  return rows;
}

function applyFilters(rows, args) {
  return rows.filter((row) => {
    if (args.type && row.object_type !== args.type) {
      return false;
    }
    if (args.team && row.team_id !== args.team) {
      return false;
    }
    if (args.hasSource && !row.latest_source) {
      return false;
    }
    if (args.hasOpenAction && !(row.latest_action_open_count > 0)) {
      return false;
    }
    return true;
  });
}

function compareRows(left, right) {
  const scoreCompare = Number(right.match_score || 0) - Number(left.match_score || 0);
  if (scoreCompare !== 0) {
    return scoreCompare;
  }

  const sourceCompare = Number(Boolean(right.latest_source)) - Number(Boolean(left.latest_source));
  if (sourceCompare !== 0) {
    return sourceCompare;
  }

  const actionCompare = Number(right.latest_action_open_count || 0) - Number(left.latest_action_open_count || 0);
  if (actionCompare !== 0) {
    return actionCompare;
  }

  const staleCompare = Number(Boolean(left.summary_is_stale_against_source || left.action_is_stale_against_source)) -
    Number(Boolean(right.summary_is_stale_against_source || right.action_is_stale_against_source));
  if (staleCompare !== 0) {
    return staleCompare;
  }

  const dateCompare = String(right.latest_source_date || '').localeCompare(String(left.latest_source_date || ''));
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const typeCompare = left.object_type.localeCompare(right.object_type);
  if (typeCompare !== 0) {
    return typeCompare;
  }

  const teamCompare = String(left.team_id || '').localeCompare(String(right.team_id || ''));
  if (teamCompare !== 0) {
    return teamCompare;
  }

  return left.object_id - right.object_id;
}

function dedupeAndRank(rows) {
  const byKey = new Map();

  for (const row of rows) {
    const key = entityKey(row);
    const previous = byKey.get(key);
    if (!previous || compareRows(row, previous) < 0) {
      byKey.set(key, row);
    } else {
      previous.matched_terms = [...new Set([...(previous.matched_terms || []), ...(row.matched_terms || [])])];
      previous.matched_tokens = [...new Set([...(previous.matched_tokens || []), ...(row.matched_tokens || [])])];
    }
  }

  return [...byKey.values()].sort(compareRows);
}

function makeReadNext(row) {
  const paths = [];
  for (const key of ['latest_source', 'latest_summary', 'latest_action']) {
    if (row[key]) {
      paths.push(row[key]);
    }
  }

  if (paths.length === 0 && Array.isArray(row.raw_files)) {
    paths.push(...row.raw_files);
  }

  return [...new Set(paths)];
}

function getCandidateConfidence(row, totalResults) {
  if (totalResults > 1) {
    return 'ambiguous';
  }
  if (row.match_type === 'exact') {
    return 'exact';
  }
  if (row.match_type === 'token' && row.match_score >= 20) {
    return 'strong-token';
  }
  if (row.match_type === 'token') {
    return 'weak-token';
  }
  return 'weak-contains';
}

function getBlockingGap(row, totalResults) {
  if (totalResults > 1) {
    return 'ambiguous_match';
  }
  if (!row.latest_source) {
    return 'missing_source';
  }
  return null;
}

function getWarnings(row) {
  return [
    row.summary_is_stale_against_source ? 'stale_summary' : null,
    row.action_is_stale_against_source ? 'stale_action' : null,
    row.latest_summary_expired ? 'expired_summary' : null,
    row.latest_action_expired ? 'expired_action' : null,
  ].filter(Boolean);
}

function getApiLookupAllowedReason(row, totalResults) {
  if (!row) {
    return 'missing_local_result';
  }
  if (totalResults > 1) {
    return 'ambiguous_local_result';
  }
  return null;
}

function makeSourceGenerationCandidate(row) {
  if (row.latest_source) {
    return null;
  }

  return {
    team_id: row.team_id,
    object_type: row.object_type,
    object_id: row.object_id,
    name: row.name,
    raw_files: Array.isArray(row.raw_files) ? row.raw_files : [],
  };
}

function toAgentCandidate(row, totalResults) {
  const blockingGap = getBlockingGap(row, totalResults);
  return {
    object_type: row.object_type,
    object_id: row.object_id,
    team_id: row.team_id,
    name: row.name,
    candidate_confidence: getCandidateConfidence(row, totalResults),
    match_type: row.match_type,
    match_score: row.match_score,
    matched_terms: row.matched_terms || [],
    matched_tokens: row.matched_tokens || [],
    linked_account: row.linked_account || null,
    object_role: row.object_role || null,
    brand_posture: row.brand_posture || null,
    latest_source_date: row.latest_source_date || null,
    latest_source: row.latest_source || null,
    latest_summary: row.latest_summary || null,
    latest_action: row.latest_action || null,
    latest_action_open_count: row.latest_action_open_count || 0,
    stale: {
      source_missing: !row.latest_source,
      summary_stale: Boolean(row.summary_is_stale_against_source),
      action_stale: Boolean(row.action_is_stale_against_source),
      summary_expired: Boolean(row.latest_summary_expired),
      action_expired: Boolean(row.latest_action_expired),
    },
    read_next: makeReadNext(row),
    needs_source_generation: !row.latest_source,
    source_generation_candidate: makeSourceGenerationCandidate(row),
    can_synthesize: Boolean(row.latest_source && totalResults === 1),
    blocking_gap: blockingGap,
    warnings: getWarnings(row),
    api_lookup_allowed_reason: getApiLookupAllowedReason(row, totalResults),
  };
}

function toAgentResult(result) {
  const apiLookupAllowedReason = result.total_results === 0
    ? 'missing_local_result'
    : result.total_results > 1
      ? 'ambiguous_local_result'
      : null;
  return {
    query: result.query,
    normalized_query: result.normalized_query,
    search_mode: result.search_mode,
    total_results: result.total_results,
    index_generated_at: result.index_generated_at,
    can_answer_lookup: result.total_results > 0,
    can_synthesize: result.total_results === 1 && Boolean(result.results[0] && result.results[0].latest_source),
    api_lookup_allowed_reason: apiLookupAllowedReason,
    evidence_boundary: result.evidence_boundary,
    candidates: result.results.map((row) => toAgentCandidate(row, result.total_results)),
  };
}

function runSearch(args) {
  const namesIndex = readJson('names.json');
  const tokensIndex = readJson('tokens.json');
  const entities = readJsonl('entities.jsonl');
  const metaPath = path.join(indexRoot, 'index-meta.json');
  const meta = fs.existsSync(metaPath) ? readJson('index-meta.json') : null;
  const entityMap = buildEntityMap(entities);
  const term = normalizeLookupTerm(args.query);
  const queryTokens = tokenizeLookupTerm(args.query);

  let rows = searchExact(namesIndex, term, entityMap);
  let searchMode = 'exact';

  if (rows.length === 0) {
    rows = [
      ...searchTokens(tokensIndex, queryTokens, entityMap),
      ...searchContainingTerms(namesIndex, term, entityMap),
    ];
    searchMode = 'fallback';
  }

  rows = applyFilters(dedupeAndRank(rows), args);

  return {
    query: args.query,
    normalized_query: term,
    search_mode: searchMode,
    total_results: rows.length,
    results: rows.slice(0, args.limit),
    index_generated_at: meta && meta.generated_at,
    evidence_boundary: meta && meta.evidence_boundary,
  };
}

function printResult(result, args) {
  console.log(`query: ${result.query}`);
  console.log(`mode: ${result.search_mode}`);
  console.log(`results: ${result.total_results}`);
  if (result.index_generated_at) {
    console.log(`index generated: ${result.index_generated_at}`);
  }
  if (result.evidence_boundary) {
    console.log(`note: ${result.evidence_boundary}`);
  }

  for (const [index, row] of result.results.entries()) {
    const parts = [
      `team=${row.team_id}`,
      `${row.object_type}:${row.object_id}`,
      row.object_role,
      row.brand_posture,
      row.linked_account ? `linked=${row.linked_account}` : null,
      row.latest_source_date ? `source=${row.latest_source_date}` : 'source=missing',
      row.latest_action_open_count ? `open_actions=${row.latest_action_open_count}` : null,
    ].filter(Boolean);

    console.log(`\n${index + 1}. ${row.name}`);
    console.log(`   ${parts.join(' | ')}`);
    if (row.summary_is_stale_against_source || row.action_is_stale_against_source || row.latest_summary_expired || row.latest_action_expired) {
      console.log(`   flags: ${[
        row.summary_is_stale_against_source ? 'summary-stale' : null,
        row.action_is_stale_against_source ? 'action-stale' : null,
        row.latest_summary_expired ? 'summary-expired' : null,
        row.latest_action_expired ? 'action-expired' : null,
      ].filter(Boolean).join(', ')}`);
    }
    if (row.matched_terms && row.matched_terms.length > 0) {
      console.log(`   matched: ${row.matched_terms.slice(0, 4).join('; ')}`);
    }
    if (args.paths) {
      for (const label of ['latest_source', 'latest_summary', 'latest_action']) {
        if (row[label]) {
          console.log(`   ${label}: ${row[label]}`);
        }
      }
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.query) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const result = runSearch(args);
  if (args.agent) {
    console.log(JSON.stringify(toAgentResult(result), null, 2));
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printResult(result, args);
}

main();
