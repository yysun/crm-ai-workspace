# Improve Index Search Done

## Summary

- Added `scripts/search-index.js` for read-only local index search with exact lookup, token fallback, type filtering, source filtering, open-action filtering, JSON output, and path-oriented output.
- Enriched `scripts/build-data-index.js` output with stale summary/action flags, expiry metadata, richer name rows, action business context, token index generation, and freshness metadata.
- Fixed normalized lookup duplicates so a single lookup term no longer repeats the same entity because of alias normalization.
- Preserved the index evidence boundary: results route users to source, summary, and action files, but do not replace source-backed judgment.

## Verification

- `node --check scripts/build-data-index.js`
- `node --check scripts/search-index.js`
- `node scripts/build-data-index.js`
- `node scripts/search-index.js "Royal LePage Next Level"`
- `node scripts/search-index.js "Next Level" --type=accounts --has-source`
- `node scripts/search-index.js "Jazz Gill" --json`
- JSON/JSONL parse validation for all generated `data/index` files.
- Duplicate normalized-row validation for `data/index/names.json`.
- `git diff --check`
- CR found and fixed one issue: `actions-current` now keeps action artifact `status` and stores business object status as `entity_status`.

## Notes

- No package-level unit test command exists in this workspace.
- Generated `data/index` files are ignored by git under the existing `data/` ignore rule, but they were rebuilt locally.
- Commit was not created because the worktree already contains unrelated pre-existing changes.
