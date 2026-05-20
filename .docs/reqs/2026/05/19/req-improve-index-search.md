# Improve Index Search Requirements

## Story

The CRM workspace index should become a practical routing tool for agents and operators, not just a set of generated lookup files. Search should resolve names quickly, expose enough business context to disambiguate common brokerage names, and flag when local judgment layers are behind newer evidence.

## Requirements

- Add a local index search helper that searches `data/index` without calling the CRM API.
- Support exact normalized name lookup, partial/token fallback, entity type filtering, source coverage filtering, and open-action filtering.
- Return results with enough routing context to open the right local source, summary, or action file next.
- Deduplicate same-entity rows caused by aliases that normalize to the same lookup term.
- Enrich entity and name index rows with stale-layer and expiry signals for summary/action layers.
- Enrich action index rows with entity business context so current action search does not require a separate manual join.
- Add a token index so partial name search does not need to scan raw CRM exports.
- Add index freshness metadata that helps detect whether the index may lag raw exports or local generated layers.
- Preserve the evidence boundary: index rows route search, but franchise judgment must still read source/summary/action files.

## Acceptance Criteria

- `node scripts/build-data-index.js` generates all existing index files plus the new token index.
- `data/index/names.json` has no duplicate same-entity rows per normalized lookup term.
- `data/index/entities.jsonl` includes latest summary/action source dates, expiry fields, expired flags, and stale-against-source flags.
- `data/index/actions-current.jsonl` includes entity name, business posture fields, and open action counts.
- `data/index/index-meta.json` includes freshness metadata for raw data and generated layer trees.
- `node scripts/search-index.js "Royal LePage Next Level"` returns ranked local index results.
- `node scripts/search-index.js "Next Level" --type=accounts --has-source` resolves via token fallback.
- `node scripts/search-index.js "Jazz Gill" --json` returns machine-readable routing results.
- No CRM writes or API calls are introduced.
