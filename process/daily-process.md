# Daily Process Contract

## Purpose

Handle the operator command:

```text
download data, distill today, post actions and post inbox
```

This is a process contract, not a scriptable command. It combines deterministic data refresh and posting helpers with agent-authored distillation. The agent owns orchestration, judgment, validation, and the decision to stop when the evidence boundary is not satisfied.

The process answers: refresh the local CRM evidence, bring the judgment layer current for the run, rebuild the action queue, publish the accumulated action report to CRM `Actions`, and publish checkbox-level work items to CRM `Inbox`.

## Trigger

Use this process when the user asks for the full daily publish run with wording such as:

- `download data, distill today, post actions and post inbox`
- `run the daily process`
- `refresh CRM, distill, post actions and inbox`
- equivalent wording that includes refresh/download, distillation, accumulated actions, and inbox publishing

If the user asks only for daily triage briefing or deck output, use `process/daily-triage.md` instead. If the user asks only to rebuild action state, use `process/accumulated-actions.md`.

## Non-Script Boundary

Do not create a script that runs this whole process end to end.

Allowed deterministic scripts:

- `node scripts/refresh-crm-data.js`
- `node scripts/distillation-find-refresh-targets.js`
- `node scripts/load-distillation-batch.js`
- `node scripts/distillation-validate-outputs.js`
- `node scripts/build-accumulated-actions.js`
- `node scripts/build-data-index.js`
- `node scripts/post-accumulated-actions.js`
- `node scripts/post-inbox.js`

Prohibited automation:

- scripts, templates, migrations, or bulk transforms that draft or rewrite `summary.md`
- scripts that pretend to complete distillation
- posting actions or inbox rows while required summaries are missing, stale, invalid, or known to be non-agent-authored

Distillation must be performed by agents from current `*-source.md` files under `process/distillation.md`, `process/summary.md`, the object overlays, section guides, and any relevant scenario process.

## Date And Scope

Default as-of date is the current local date in the workspace timezone.

For bare `distill` or `distill today`, interpret the distillation scope as the as-of date only after refresh. Do not expand the run to the full missing/stale backlog unless the user explicitly asks for a backlog, full refresh, all missing summaries, all stale summaries, or a wider date range.

Use date-scoped audit flags by default:

```text
node scripts/distillation-find-refresh-targets.js --from={yyyy-mm-dd} --to={yyyy-mm-dd}
```

If the user gives a different date range, use that range. If the user gives a team, object, or scenario scope, combine that scope with the requested date range. Only omit `--from` and `--to` when the user explicitly asks for the full backlog or all missing/stale summaries.

For posting, use the as-of date for accumulated-action files:

```text
data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/actions-{yyyy-mm-dd}.md
```

Keep team queues separate. Workspace team `0` maps to API team `8` inside the posting scripts when required by the CRM route.

## Required Inputs

Read these process files before doing the relevant part of the run:

- `process/source.md`
- `process/distillation.md`
- `process/summary.md`
- `process/memory.md`
- `process/tension.md`
- `process/insight.md`
- `process/action.md`
- `process/accumulated-actions.md`

Read scenario files when source evidence supports them:

- `process/renewal.md`
- `process/ownership-transition.md`
- `process/recruiting.md`
- `process/competitive-risk.md`

Read object overlays required by distillation:

- `process/objects/account.md`
- `process/objects/contact.md`

## Run Sequence

1. Confirm the as-of date and any user-specified team/date/object scope.
2. Refresh local CRM data:

```text
node scripts/refresh-crm-data.js
```

3. Audit distillation coverage:

```text
node scripts/distillation-find-refresh-targets.js
```

Use scope flags only when the user explicitly limited the run.

4. If audit targets exist, create a fixed manifest under:

```text
my-work/{yyyy}/{mm}/{dd}/distillation-manifest-{yyyy-mm-dd}.json
```

The manifest is routing state only. It should record:

- source path
- summary path
- reason
- batch ID
- ordinal
- first and last source per batch
- count per batch

5. Split the manifest into batches of up to 100 targets.
6. If the run is large enough that parallel work is needed, ask for explicit approval before spawning parallel agents. Without that approval, process batches sequentially.
7. Distill each target by reading the current `*-source.md` and authoring the sibling `*-summary.md` directly from the distillation process. Scripts may list or load batches, but must not draft summary text.
8. Track the earliest and latest snapshot dates for any created, updated, checked, removed, or materially changed `## Proposed Actions`.
9. Re-run the distillation audit for the requested scope. Do not proceed until it reports zero targets.
10. Validate summary outputs:

```text
node scripts/distillation-validate-outputs.js
```

Do not proceed until validation reports zero failures.

11. Rebuild accumulated actions once per affected team/date range. Use the earliest changed action snapshot date as `--from` and the as-of date as `--to`:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}
```

If no summary actions changed but the user requested a daily publish run, rebuild the queues through the as-of date so posting uses current queue state.

12. Rebuild the routing index after local layer files materially changed:

```text
node scripts/build-data-index.js
```

13. Dry-run both posting destinations before live writes:

```text
node scripts/post-accumulated-actions.js --team-file --file={team-actions-md} --dry-run
node scripts/post-inbox.js --date={yyyy-mm-dd} --dry-run
```

Use one `--file` per team action report for accumulated actions.

14. If dry-runs pass and the user requested posting, run the live posts:

```text
node scripts/post-accumulated-actions.js --team-file --file={team-actions-md}
node scripts/post-inbox.js --date={yyyy-mm-dd}
```

Live posting requires:

- `AIW_ENABLE_CRM_ACTION_POST=1` for `POST /api/data/actions`
- `AIW_ENABLE_CRM_INBOX_POST=1` for `POST /api/data/inbox`
- `CRM_BASE_URL`
- `CRM_ACCESS_TOKEN`

If gates are missing, stop after dry-run and report that posting was blocked by the explicit write boundary.

## Posting Rules

Post accumulated action markdown snapshots to CRM `Actions` only:

```text
node scripts/post-accumulated-actions.js --team-file --file=data/0/daily-triage/{yyyy}/{mm}/{dd}/actions-{yyyy-mm-dd}.md
```

Post checkbox-level work items to CRM `Inbox` only:

```text
node scripts/post-inbox.js --date={yyyy-mm-dd}
```

Do not use the actions-table script for inbox rows. Do not use the inbox script for accumulated markdown snapshots.

## Stop Conditions

Stop before posting when any of these are true:

- refresh failed
- required local source coverage is missing
- distillation audit has targets remaining
- summaries fail validation
- a needed `actions-{yyyy-mm-dd}.md` file is missing
- post dry-run fails
- live post gates are not enabled
- API credentials are missing
- a noncompliant script-authored summary pass is discovered

When stopping, report the exact blocker, the relevant command or manifest path, and what must happen next.

## Completion Criteria

Do not claim the daily process is complete unless:

- CRM data was refreshed or the user explicitly skipped refresh
- source generation completed for relevant years
- distillation audit reports zero remaining targets for the requested scope
- validation reports zero summary failures
- accumulated-action queues were rebuilt through the as-of date
- data index was rebuilt after material layer changes
- action posting dry-run passed
- inbox posting dry-run passed
- live posting either succeeded or was explicitly blocked by disabled write gates and reported as not posted

Report final counts:

- source files audited
- distillation targets completed
- validation failures
- teams rebuilt
- action report files posted or dry-run parsed
- inbox payloads posted or dry-run parsed

## Non-Goals

- Do not create daily triage decks or PDFs unless the user explicitly asks for briefing output.
- Do not write CRM account, contact, or note records.
- Do not infer missing evidence from live API lookup output unless it has been refreshed into local source coverage.
- Do not collapse team queues into one combined action report.
