# Plan: Inbox Action Contract

## Goal

Make Inbox actions clean operational work items: atomic checkbox rows with short titles, full action instructions, category lanes, evidence-backed trace content, and a safe remediation path for existing summaries. The daily pipeline must become script-orchestrated without letting scripts author judgment.

## Current Context

- `.docs/reqs/2026/06/26/req-inbox-action-contract.md` defines the target contract: atomic actions, `ActionTitle`, separate category, full `ActionText`, source-note evidence in `TraceMarkdown`, batch Codex CLI remediation, and a top-level daily Inbox orchestrator.
- `AGENTS.md` already defines the key boundary: deterministic scripts may refresh, route, validate, accumulate, and publish, but `*-summary.md` judgment must be agent-authored from current local source evidence.
- `process/daily-process.md` currently says `Do not create a script that runs this whole process end to end.` That must change to allow an orchestrator that calls Codex CLI workers for judgment while preserving the no-script-authored-summary boundary.
- `process/distillation.md`, `process/summary.md`, `process/action.md`, and the scenario files own summary structure and action semantics. They need contract updates so proposed actions are atomic and support title/category/full-text extraction.
- `scripts/post-inbox.js` is the shared Inbox payload builder for API posting and direct SQL posting. It currently emits `actionText`, `actionKey`, trace/source fields, and separate insight/tensions/memory fields.
- `scripts/post-inbox-sql.js` reuses `scripts/post-inbox.js` payloads and merges into `dbo.Inbox`. It currently binds only the columns present in the SQL table; `dbo.Inbox` has no `ActionTitle` or normalized category column.
- `api.yaml` documents the Inbox API payload. It currently exposes `actionText` but no separate `ActionTitle` or action category lane.
- `/Users/esun/Documents/Projects/rlpCRM/api/src/functions/data-routes/inbox.ts` owns the live `/api/data/inbox` route. It currently selects, validates, inserts, patches, and searches `ActionText` and `TraceMarkdown`, but has no `ActionTitle` or action category lane.
- `/Users/esun/Documents/Projects/rlpCRM/src/services/inboxService.ts` currently derives `displayActionText` from `actionText` with punctuation parsing. `/Users/esun/Documents/Projects/rlpCRM/src/pages/AIInbox.tsx` displays `displayActionText` in the list and detail header.
- `/Users/esun/Documents/Projects/rlpCRM/tests/src/unit/inboxService.test.ts`, `/Users/esun/Documents/Projects/rlpCRM/tests/src/unit/aiInboxPage.test.tsx`, and `/Users/esun/Documents/Projects/rlpCRM/tests/api/unit/inbox-routes.test.ts` are the focused tests for the client/service/API Inbox contract.
- `scripts/build-accumulated-actions.js` derives deterministic accumulated action snapshots from `## Proposed Actions`; its output currently carries action text and metadata, not a title/category/full-text action shape.
- `scripts/distillation-find-refresh-targets.js`, `scripts/load-distillation-batch.js`, `scripts/distillation-validate-outputs.js`, `scripts/build-accumulated-actions.js`, `scripts/build-data-index.js`, `scripts/post-inbox.js`, and `scripts/post-inbox-sql.js` are the existing deterministic building blocks for an orchestrator.
- The current repo has no dedicated test runner script beyond Node script checks; validation should use `node --check`, dry-run commands, and focused Node assertions over generated payloads and manifests.

## Decisions

- Add a durable action contract instead of relying on punctuation parsing. `ActionTitle`, category/lane, and full `ActionText` must be represented as distinct fields by the time rows reach Inbox payloads.
- Preserve backward compatibility only where needed for migration. Existing summary checkbox text can still be read, but validation must flag compound or title-less rows that cannot produce the new contract cleanly.
- Do not implement a regex splitter that rewrites summary judgment. Candidate detection can be heuristic, but actual summary remediation must be agent-authored or explicit reviewed replacement.
- Add a batch-remediation script that launches Codex CLI workers with GPT-5.5 medium by default. The script owns manifests and process control; workers own summary authorship.
- Add a top-level daily orchestrator that chains refresh/source/audit/batch/validate/accumulate/index/dry-run/post. The orchestrator must fail closed when validation fails or write gates are absent.
- Prefer direct SQL Inbox publishing only when the operator selects it and supplies explicit team scope; API Inbox remains the documented default publish path unless the operator requests SQL.
- Keep CRM `Actions` archive posting out of the default daily orchestrator. It may be an explicit optional archive step only if separately requested.
- E2E coverage is required as CLI integration scenarios, not browser automation, because the change spans data refresh, Codex workers, deterministic artifacts, and gated publishing.

## Phased Tasks

### Phase 1 - Discovery and scope lock

- [x] Inspect `.docs/reqs/2026/06/26/req-inbox-action-contract.md` to confirm every acceptance criterion is represented in this plan.
- [x] Inspect `api.yaml`, `scripts/post-inbox.js`, and `scripts/post-inbox-sql.js` to confirm the current Inbox payload and SQL schema assumptions for `ActionText`, `TraceMarkdown`, and missing `ActionTitle`.
- [x] Inspect `scripts/build-accumulated-actions.js` and current `data/{teamId}/daily-triage/**/accumulated-actions-*.json` shape to confirm where action title/category fields should be derived or carried.
- [x] Inspect `process/daily-process.md`, `process/distillation.md`, `process/summary.md`, and `process/action.md` to identify text that still prohibits orchestration or permits compound proposed actions.
- [x] Record that CRM account, contact, and note records remain out of write scope; only local artifacts and gated Inbox rows are in scope.

### Phase 2 - Contract and schema foundation

- [x] Update `process/action.md` so proposed actions are atomic and carry enough structure to derive category, `ActionTitle`, and full `ActionText` without punctuation guessing.
- [x] Update `process/summary.md` and `process/distillation.md` so agents author atomic `## Proposed Actions` and avoid `Purpose:` clauses that combine multiple jobs into one checkbox.
- [x] Update `process/daily-process.md` so a daily orchestrator is allowed only when it delegates summary authorship to Codex CLI workers and preserves validation/write gates.
- [x] Update `api.yaml` to add `actionTitle` and normalized action category/lane fields to the Inbox payload contract.
- [x] Add a SQL migration or documented schema step for `dbo.Inbox.ActionTitle` and the normalized category/lane column, with bounded lengths and nullable/backfill behavior defined.
- [x] Update `/Users/esun/Documents/Projects/rlpCRM/api/src/functions/data-routes/inbox.ts` so `GET`, `POST`, and `PATCH /api/data/inbox` validate, persist, return, and search `ActionTitle` and action category/lane fields.
- [x] Update any local API/SQL contract docs so `TraceMarkdown` allows bounded source note excerpts but rejects Insight/Tensions/Memory and summary labels.

### Phase 3 - Payload and queue implementation

- [x] Update `scripts/build-accumulated-actions.js` so accumulated action rows carry or derive `action_title`, `action_category`, and full `action_text` while preserving stable action identity rules.
- [x] Update `scripts/post-inbox.js` so active and removed payloads include `actionTitle`, normalized category/lane, full `actionText`, and evidence-only `traceMarkdown` with bounded local source note evidence when available.
- [x] Update `scripts/post-inbox-sql.js` so direct SQL merges bind and persist `ActionTitle` and category/lane fields without dropping existing status, removal, or trace behavior.
- [x] Update `/Users/esun/Documents/Projects/rlpCRM/src/models/InboxItem.ts` and `/Users/esun/Documents/Projects/rlpCRM/src/services/inboxService.ts` so `displayActionText` prefers `actionTitle` and falls back to legacy parsing only for old rows without a title.
- [x] Update `/Users/esun/Documents/Projects/rlpCRM/src/pages/AIInbox.tsx` so list rows, detail headers, task titles, note seeds, and search text use `ActionTitle` for display while preserving full `ActionText` in detail context.
- [x] Add validation in the payload builder or a dedicated audit script that flags compound action candidates, missing titles, category/title confusion, and forbidden `TraceMarkdown` sections before posting.
- [x] Confirm `actionKey` behavior for split actions: old compound rows become superseded/removed and new atomic rows receive distinct keys without rewriting history.

### Phase 4 - Codex CLI batch remediation

- [x] Add `scripts/batch-remediate-summaries.js` to build a fixed manifest under `my-work/{yyyy}/{mm}/{dd}/` with source paths, summary paths, batch IDs, object metadata, and disjoint write ownership.
- [x] Add support in `scripts/batch-remediate-summaries.js` for invoking Codex CLI workers in parallel with GPT-5.5 medium by default and an override for high-risk batches.
- [x] Ensure each Codex CLI worker prompt requires reading `AGENTS.md`, `process/distillation.md`, `process/summary.md`, `process/action.md`, object overlays, relevant scenario files, assigned `*-source.md`, and referenced local note files.
- [x] Ensure worker write permissions are constrained by manifest: each worker may write only assigned sibling `*-summary.md` paths and must not rebuild indexes, accumulated actions, or progress artifacts.
- [x] Add worker status collection that reports completed, failed, skipped, and invalid outputs without treating partial completion as success.

### Phase 5 - Daily orchestrator

- [x] Add `scripts/run-daily-inbox-pipeline.js` to coordinate refresh mode, local-only mode, date/team scope, summary audit, Codex batch remediation, validation, accumulated-action rebuild, index rebuild, Inbox dry-run, and optional live Inbox post.
- [x] Wire `scripts/run-daily-inbox-pipeline.js` to call `scripts/refresh-crm-data.js` only in refresh mode, and to refuse silent data pulls during local-only remediation.
- [x] Wire the orchestrator to run `scripts/distillation-find-refresh-targets.js` and stop when remaining targets exist after Codex worker completion.
- [x] Wire the orchestrator to run `scripts/distillation-validate-outputs.js` and stop on any validation failure before accumulated actions or posting.
- [x] Wire the orchestrator to rebuild accumulated actions once per affected team/date range and then run `scripts/build-data-index.js`.
- [x] Wire the orchestrator to dry-run `scripts/post-inbox.js` or `scripts/post-inbox-sql.js` and require a clean dry-run before any live post.
- [x] Add explicit flags for publish path: API Inbox, direct SQL Inbox, dry-run only, and optional explicit CRM `Actions` archive posting; default behavior must not archive to CRM `Actions`.

### Phase 6 - Tests and verification wiring

- [x] Add or update Node assertions for `scripts/post-inbox.js` payloads covering `actionTitle`, category/lane, full `actionText`, note-evidence `TraceMarkdown`, removed rows, and forbidden trace sections.
- [x] Add or update `/Users/esun/Documents/Projects/rlpCRM/tests/api/unit/inbox-routes.test.ts` for API schema, SQL selection/search/upsert, and response shape covering `actionTitle` and action category/lane.
- [x] Add or update `/Users/esun/Documents/Projects/rlpCRM/tests/src/unit/inboxService.test.ts` and `/Users/esun/Documents/Projects/rlpCRM/tests/src/unit/aiInboxPage.test.tsx` so the UI displays `actionTitle` first and does not depend on parsing `actionText`.
- [x] Add dry-run tests or fixtures for `scripts/batch-remediate-summaries.js` proving manifest creation, disjoint write sets, GPT-5.5 medium default, and no summary prose generation by the script.
- [x] Add dry-run tests or fixtures for `scripts/run-daily-inbox-pipeline.js` proving local-only mode avoids refresh, refresh mode calls the refresh step, failed validation blocks posting, and absent write gates block live publishing.
- [x] Run `for file in scripts/post-inbox.js scripts/post-inbox-sql.js scripts/build-accumulated-actions.js scripts/batch-remediate-summaries.js scripts/run-daily-inbox-pipeline.js; do node --check "$file"; done` and record zero syntax failures.
- [x] Run representative dry-runs against Wolstencroft/account 101 fixtures and a multi-team date to prove atomic action payloads, evidence-only trace, and dry-run publish summaries.
- [x] Run `cd /Users/esun/Documents/Projects/rlpCRM && npx vitest tests/api/unit/inbox-routes.test.ts tests/src/unit/inboxService.test.ts tests/src/unit/aiInboxPage.test.tsx --run` and record the focused API/service/UI result.
- [ ] Run `cd /Users/esun/Documents/Projects/rlpCRM && npm run check` and record the TypeScript result.
- [x] Execute `.docs/tests/test-inbox-action-contract.md` scenarios and record observed outputs.

### Phase 7 - Documentation and migration status

- [x] Update `AGENTS.md` file map and workflow sections for the new batch remediation and daily orchestrator scripts.
- [x] Update `process/daily-process.md` examples to show the orchestrator command and the lower-level manual fallback sequence.
- [x] Update `api.yaml` examples to include `actionTitle`, category/lane, note-evidence trace, and removed action rows.
- [x] Document the migration/backfill approach for existing Inbox rows so older compound actions become superseded/removed rather than silently mutated into new action meaning.
- [ ] Record final evidence showing the REQ acceptance criteria are satisfied, including validation counts and dry-run/live publish results.

## Validation

- `for file in scripts/post-inbox.js scripts/post-inbox-sql.js scripts/build-accumulated-actions.js scripts/batch-remediate-summaries.js scripts/run-daily-inbox-pipeline.js; do node --check "$file"; done` must complete with zero syntax errors.
- `cd /Users/esun/Documents/Projects/rlpCRM && npx vitest tests/api/unit/inbox-routes.test.ts tests/src/unit/inboxService.test.ts tests/src/unit/aiInboxPage.test.tsx --run` must pass.
- `cd /Users/esun/Documents/Projects/rlpCRM && npm run check` must pass.
- A payload assertion over a Wolstencroft fixture must show separate atomic actions with `ActionTitle`, category/lane, full `ActionText`, and note-evidence-only `TraceMarkdown`.
- A forbidden-trace assertion must report zero structural `#### Insight`, `#### Tensions`, `#### Memory`, `Latest summary`, or `Source summary` blocks in generated Inbox payload trace fields.
- A batch remediation dry-run must create a manifest with disjoint write sets, GPT-5.5 medium default, and no generated summary prose.
- A daily orchestrator dry-run in local-only mode must skip refresh, run audit/validation/dry-run publish, and report the live publish command without writing.
- A daily orchestrator refresh dry-run must call or plan `scripts/refresh-crm-data.js`, then continue only after source and summary validation pass.
- A direct SQL dry-run must require explicit teams and report planned inserts, updates, stale closures, and missing link cleanup before live write is allowed.
- `.docs/tests/test-inbox-action-contract.md` must be executed manually or with equivalent CLI evidence.

## Validation Evidence

- Passed: `for file in scripts/post-inbox.js scripts/post-inbox-sql.js scripts/build-accumulated-actions.js scripts/batch-remediate-summaries.js scripts/run-daily-inbox-pipeline.js scripts/test-inbox-action-contract.js; do node --check "$file"; done && node scripts/test-inbox-action-contract.js`.
- Passed: `cd /Users/esun/Documents/Projects/rlpCRM && npx vitest tests/src/unit/inboxService.test.ts tests/src/unit/aiInboxPage.test.tsx --run`.
- Passed: `cd /Users/esun/Documents/Projects/rlpCRM/api && npx vitest ../tests/api/unit/inbox-routes.test.ts --config=vitest.api.config.ts --run`.
- Passed: `cd /Users/esun/Documents/Projects/rlpCRM/api && npm run build`.
- Dry-run evidence: `node scripts/run-daily-inbox-pipeline.js --date=2026-05-29 --from=2026-05-29 --team=0 --local-only --publish=api --dry-run --json` executed non-writing gates with API publishing scoped to `--teams=0` and reported `141` Inbox payloads with `214` contract warnings, which blocks live posting until summary remediation. The earlier `846` payload count was an unscoped all-team dry-run and is not the team 0 publish count.
- SQL evidence: `SELECT COUNT(*) FROM dbo.Inbox` reports `936` rows: `901` open and `35` superseded. By team/status: team `6` has `241` open and `12` superseded, team `7` has `497` open, and team `8` has `163` open and `23` superseded.
- Dry-run evidence: `node scripts/batch-remediate-summaries.js --from=2026-04-07 --to=2026-04-07 --team=0 --batch-size=50 --dry-run --json` reported one Wolstencroft target, one batch, and default model `gpt-5.5-medium`.
- Blocked: `cd /Users/esun/Documents/Projects/rlpCRM && npm run check` still fails on unrelated existing `src/pages/Login.tsx` TypeScript errors (`useEffect` unused, implicit `any` for `path`, and `window.opera` type).

## Rollback / Risk

- Schema changes are the highest coordination risk because `dbo.Inbox`, API payloads, SQL publishing, and UI display must agree on `ActionTitle` and category/lane fields. Roll back by disabling live posting and reverting to dry-run-only until all surfaces align.
- Cross-repo coordination with `/Users/esun/Documents/Projects/rlpCRM` is required. If the workspace payload changes ship before the API/UI surface, live posting must stay dry-run-only.
- Splitting compound actions changes action keys. The implementation must preserve history by superseding/removing old compound rows and creating new atomic rows rather than mutating old keys silently.
- Codex CLI worker orchestration can create partial output. The parent orchestrator must treat partial completion as blocked and must not rebuild actions or post Inbox rows until audit and validation pass.
- Source-note excerpts can bloat trace payloads or expose irrelevant text. Keep excerpts bounded, sourced from local generated artifacts, and validated for direct relevance to the action.
- The orchestrator changes a prior process rule that prohibited full process scripts. The new boundary must be documented clearly: orchestration is allowed, script-authored judgment remains prohibited.

## Review Notes

AR passed: no blocking architecture flaws. The initial AP draft missed the `rlpCRM` API/UI display surface, which would have left the `ActionTitle` acceptance criteria incomplete. The plan now covers `crm-ai-workspace` payload/orchestration work, `rlpCRM` API and AI Inbox display changes, cross-repo verification, and CLI integration scenarios.
