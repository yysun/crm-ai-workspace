# Plan: Inbox-Only Action Queue

## Scope

Make Inbox the daily operational publish path and reduce CRM `Actions` to explicit archive use. Enrich Inbox rows with full action trace and same-day removal state.

## E2E Coverage Decision

No browser E2E is needed. This is a CLI/workspace integration change. Validation should use script syntax checks and dry-run/parser checks against synthetic Markdown and removed-action inputs without live CRM writes.

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Implementation Notes

- Update `process/daily-process.md` and `AGENTS.md` so default daily publish means Inbox only.
- Keep `post-accumulated-actions.js` documented as archive-only.
- Update `api.yaml` for enriched Inbox payload fields and removal statuses.
- Update `scripts/post-inbox.js` to:
  - parse full account/contact trace sections from `actions-YYYY-MM-DD.md`
  - include insight, tensions, memory, trace markdown, source report path, and latest summary path when available
  - read matching `removed-actions-YYYY-MM-DD.json` by default
  - map removal reasons to operator statuses
  - fail rather than silently skipping duplicate non-open status updates when the backend does not upsert
  - export parser helpers for local validation

## Review Notes

AR passed: no blocking architecture flaws. The only real dependency is backend support for the enriched Inbox contract. The plan handles that by updating `api.yaml` and making duplicate non-open rows fail loudly instead of pretending stale Inbox closure succeeded.

CR passed: no blocking code issues found after implementation. Validation covered script syntax, API YAML parsing, whitespace checks, active payload parsing, and removed payload generation.
