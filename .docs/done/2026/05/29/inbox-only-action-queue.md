# Done: Inbox-Only Action Queue

## Summary

- Made CRM `Inbox` the default daily operational publish target.
- Reframed CRM `Actions` posting as explicit archive-only snapshot publishing.
- Enriched `post-inbox.js` payloads with trace Markdown, insight, tensions, memory, source report path, summary path, evidence date, and removal state.
- Added default same-day removal publishing from `removed-actions-YYYY-MM-DD.json`.
- Updated `api.yaml`, `AGENTS.md`, and `process/daily-process.md` so the workflow and contract match the product model.

## Verification

- `node -c scripts/post-inbox.js`
- `node -c scripts/post-accumulated-actions.js`
- `node -c scripts/build-accumulated-actions.js`
- `ruby -e 'require "yaml"; YAML.load_file("api.yaml"); puts "api.yaml parse ok"'`
- Synthetic Node parser checks for active Inbox rows and removed-action payloads.
- `node scripts/post-inbox.js --help`
- `node scripts/post-accumulated-actions.js --help`
- `git diff --check`

## Notes

- No live CRM writes were run.
- No project-level package test runner exists in this workspace.
- Backend `POST /api/data/inbox` must accept the enriched fields in `api.yaml`; otherwise dry-run will pass but live posting will fail at the API boundary.
- Existing untracked `mobile-logs.csv` and `mobile-logs.json` were left untouched.
