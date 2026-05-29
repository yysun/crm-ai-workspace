# Plan: AIW Contract Fixes

## Scope

Fix the six known AIW contract problems without broad refactors or data regeneration. Keep the changes in process documentation, source-generation classification wording, and a lightweight eval contract.

## E2E Coverage Decision

No browser or external E2E coverage is needed. This is a workspace-contract and CLI script change. Verification should use syntax checks, targeted text searches, and any focused deterministic checks that do not touch live CRM writes.

## Tasks

- [x] Inspect relevant files
- [x] Make focused changes
- [x] Run validation
- [x] Update docs/status

## Implementation Notes

- Update `AGENTS.md` non-negotiables and briefing wording to match the allowed read-only and gated-publishing boundaries.
- Update `process/daily-process.md` so the default daily audit command is date-scoped in the run sequence.
- Update `process/action.md` output format so action metadata is nested under checkbox actions inside `## Proposed Actions`.
- Update `process/source.md` and `scripts/generate-source.js` to describe and emit brand evidence/posture-candidate labels rather than overclaiming non-RLP prospecting from name absence alone.
- Update `process/daily-triage.md` to allow deterministic PDF export from agent-authored Marp while keeping content authorship with agents.
- Add a small eval contract under `eval/` or equivalent that defines semantic contract cases for distillation judgment.

## Review Notes

AR passed: no blocking architecture flaws. The narrow fix is to align the existing contracts rather than expand validators into semantic scoring now; adding contract-case eval documentation captures the missing quality layer without pretending structural scripts can verify judgment.

CR passed: no blocking code or contract issues found after implementation. Focused review caught and fixed the broad host-assumption CRM write sentence in `AGENTS.md`; validation then passed with syntax checks, scoped no-data audit/validation runs, contradiction searches, and whitespace checks.
