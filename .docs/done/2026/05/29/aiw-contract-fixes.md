# AIW Contract Fixes

## Summary

- Replaced broad CRM write prohibitions with the actual boundary: no account/contact/note writes, read-only helper scripts for CRM reads, and explicit gated scripts for Inbox/Actions publishing.
- Fixed the default daily process audit command so daily runs stay date-scoped unless the user asks for backlog scope.
- Kept `summary.md` top-level sections stable by moving action rationale, preconditions, purpose, and local state under `## Proposed Actions` checkbox bullets.
- Updated source generation so brand output separates Royal LePage name evidence from posture candidates and stops treating name absence as confirmed non-RLP prospecting posture.
- Clarified that agents author daily triage brief and Marp content while deterministic renderers may export matching PDFs.
- Added `eval/distillation-contract-cases.md` for semantic contract checks that structural validators cannot prove.

## Verification

- `node --check scripts/generate-source.js && node --check scripts/layered-artifact-utils.js && node --check scripts/distillation-validate-outputs.js && node --check scripts/distillation-find-refresh-targets.js`
- `node scripts/distillation-find-refresh-targets.js --team=999999 --from=2026-05-29 --to=2026-05-29 && node scripts/distillation-validate-outputs.js --team=999999 --from=2026-05-29 --to=2026-05-29`
- `rg` contradiction search for the removed broad CRM prohibition, unscoped daily audit command, old action headings, old brand-posture labels, and old PDF-script wording
- `git diff --check`

## Notes

- No live CRM writes were run.
- Existing source artifacts were not regenerated; the new brand-evidence wording applies on future `generate-source.js` runs.
- The new eval file is a contract checklist, not an automated semantic scorer.
