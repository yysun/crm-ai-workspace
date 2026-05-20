# Improve Index Search Plan

## Approach

Keep the index deterministic and file-based. Improve `scripts/build-data-index.js` so generated index rows carry routing context, staleness, action context, token lookup data, and freshness metadata. Add `scripts/search-index.js` as the supported local search interface over those files.

No E2E spec is needed. This is an internal CLI/data-routing change, not a user-facing browser flow, auth flow, payment flow, or cross-system write integration.

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Implementation Notes

- Preserve existing uncommitted changes in `scripts/build-data-index.js` and `scripts/search-crm.js`.
- Add source-file top comment blocks once implementation begins, per RPD source editing rules.
- Use `data/index/entities.jsonl` as the rich entity source for the search helper.
- Use `data/index/names.json` for exact lookup and `data/index/tokens.json` for fallback lookup.
- Keep generated index rows as routing aids only; do not encode synthesized franchise conclusions beyond values already parsed from layer files.
