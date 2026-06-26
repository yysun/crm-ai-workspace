# Distillation Process

## Purpose

Turn a factual `source.md` snapshot into the judgment layer for the same object and snapshot.

Distillation starts from `source.md` and creates or refreshes `summary.md`. Supported actions live inside the `## Proposed Actions` section of that summary.

In dated buckets, the summary lives beside the object JSON and `*-source.md` file, for example `account-2279-summary.md`.

Distillation is an AI-agent workflow. Do not use scripts to draft or refresh `summary.md`. Scripts may load or list source batches, but the agent must follow this process step by step when writing summaries.

For large runs, use fixed, agent-owned batches. The compliant pattern is: audit the missing/stale eligible targets, freeze a dated manifest under `my-work/{yyyy}/{mm}/{dd}/`, split into disjoint batches of up to 100 objects, have each assigned agent author only its sibling `*-summary.md` files from the current active `*-source.md` files, then run parent-level validation, accumulated-action rebuilds, and index rebuild. Scripts may organize, validate, and rebuild deterministic state; they must not draft, migrate, template, or bulk-transform summary judgment.

This process is the orchestration layer for the section guides in:

- `process/memory.md`
- `process/objects/account.md`
- `process/objects/contact.md`
- `process/tension.md`
- `process/insight.md`
- `process/action.md`

Use this file when the task is to synthesize meaning or next moves from an existing evidence layer.

## Traceability Rule

Nothing may move into the active `source -> memory -> tension -> insight -> action` chain unless it can be tied to:

- a real local source listed in `source_files`
- a real business object with a stable object type and object ID
- a clear time window such as the dated bucket, `source_date`, or explicit note date carried by the current evidence

Before any fact, pattern, tension, judgment, or action moves downstream, the run must preserve:

- where the evidence came from
- which object it belongs to
- what period the evidence covers
- what is still missing or unclear

Unsupported inference, invented object IDs, object merges without evidence, and conclusions that cannot be traced to the current source layer are not allowed.

If the source evidence changes, is found incomplete, or is contradicted by newer same-object evidence, downstream memory, tension, insight, and action must be refreshed, narrowed, or downgraded accordingly.

## Inputs

Required inputs:

- current or dated `source.md` for the same object and snapshot
- `process/summary.md`
- `process/memory.md`
- object overlay for the target type: `process/objects/account.md` or `process/objects/contact.md`, including its `## Rule Table`
- `process/tension.md`
- `process/insight.md`
- `process/action.md`

Optional inputs:

- existing `summary.md` for the same snapshot when refreshing
- older dated `*-summary.md` snapshots for the same object when continuity checks are needed
- scenario process files when the current evidence clearly supports a scenario lens

Do not start distillation from raw notes, live API lookup results, or helper-script output alone when a same-snapshot `source.md` is missing. Refresh or create `source.md` first.

## When To Use

Use this process for prompts such as:

- summarize this account or contact
- what does this mean now
- what changed since last time
- what should we do next
- create or refresh the judgment layer from sources

Do not use this process when the user asked only for facts. In fact-only mode, stop at `source.md`.

For fact-only account/contact search, use the local index helper first:

```text
node scripts/search-index.js --type=contacts "Name"
node scripts/search-index.js --type=accounts "Name"
node scripts/search-index.js "Name" --has-source
node scripts/search-index.js "Name" --has-open-action --paths
node scripts/search-index.js "Name" --agent
```

Use the documented read-only CRM helper only when `AIW_ENABLE_CRM_API=1` is set and the user asks for live/fresh/latest data, note inspection, recent-change confirmation, or the local index result is missing, stale, ambiguous, or contradicted by the task:

```text
node scripts/search-crm.js --type=contacts "Name"
node scripts/search-crm.js --type=accounts "Name"
node scripts/search-crm.js --include-notes "Name"
node scripts/search-crm.js --type=contacts --notes-only "Name"
```

Those outputs may answer the immediate lookup question, but API output does not authorize `summary.md`, daily triage, or deck/report synthesis unless the same evidence is refreshed into local `source.md` coverage first.

## Distillation Sequence

Run the steps in this order:

1. Read the target `source.md` for the object and snapshot.
2. Confirm the `source.md` frontmatter and required sections are present.
3. Check the source frontmatter `status`. If it is closed, inactive, archived, completed, terminated, cancelled, disabled, deleted, or another closed-style value, stop normal distillation for that object. Do not write or refresh `summary.md`; let accumulated-action rebuild consume the closed source as a `closed-status` removal signal.
4. Establish the traceability envelope for the run: team ID, object type, object ID, source files, source date or coverage window, and current key unknowns.
5. Determine whether the object is an account or a contact from the target path or frontmatter.
6. Determine the team objective from `team_id` before applying generic brand posture:
   - Team `0`: Royal LePage retention first; contact commercial-program potential second when supported.
   - Team `6`: non-Royal-LePage prospecting first.
   - Team `7`: contact commercial-program targeting first for both accounts and contacts.
7. Read `process/summary.md` as the output contract.
8. Read `process/memory.md` plus the matching object overlay in `process/objects/account.md` or `process/objects/contact.md` before drafting `## Memory`.
9. Use the overlay's `## Rule Table` as a required decision table for the run. Evaluate the source evidence against the table columns in order: `Situation Type`, `Key Input Fields`, `Minimum Trigger Threshold`, `Tension`, `Judgment Direction`, `Suggested Action`, and `Prohibited Misuse`.
10. Match only the row or rows whose `Key Input Fields` are actually present in `source.md` and whose `Minimum Trigger Threshold` is met by the current evidence. If no row clears its threshold, do not force an object-level judgment from the table.
11. For each matched row, use `Tension` to shape `## Tensions`, use `Judgment Direction` to shape `## Memory` and `## Insight`, use `Suggested Action` to constrain `## Proposed Actions`, and use `Prohibited Misuse` as a guardrail against overreach.
12. Apply the team objective before brand posture:
    - For team `0`, accounts are retention-first; contacts are retention-first with commercial-program potential added only when evidence supports it.
    - For team `6`, accounts and contacts are prospecting-first; do not reframe them as retention cases because they resemble an in-brand workflow.
    - For team `7`, accounts and contacts are commercial-program-first; for accounts, summarize brokerage context only as it affects commercial contact access, eligibility, or program fit.
13. For contacts, anchor the person to the linked account when known, preserve the account relationship in memory, and keep commercial-program potential separate from brokerage classification unless team `7` makes the commercial-program lens primary.
14. Do not move any fact or interpretation into `## Memory`, `## Tensions`, `## Insight`, or `## Proposed Actions` unless it can still be tied back to the traceability envelope established from the current source layer.
15. Read `process/tension.md` and add `## Tensions` only when active pressure, contradiction, risk, or opportunity is supported.
16. Read `process/insight.md` and add `## Insight` only when the current evidence supports a meaningful judgment.
17. Read `process/action.md` and add `## Proposed Actions` only when actions follow from the current evidence and insight.
18. Write or refresh `summary.md` for the same snapshot.
19. Do not create `action.md`; `summary.md` is the sole judgment artifact.
20. If the summary's `## Proposed Actions` section was created, updated, checked, removed, or materially changed, record the affected snapshot date for accumulated-action rebuild.
21. After all requested objects in the distillation run have been processed, rebuild accumulated-action snapshots once if any affected summary action dates were recorded, or if closed source snapshots were generated in the requested date/team scope:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={earliest-affected-date} --to={latest-required-date}
```

Use the team ID from the source/summary path as `{teamId}`; CRM team `-1` is stored as `0`. Use the earliest changed summary action snapshot date as `{earliest-affected-date}`. The script seeds from the latest accumulated snapshot before that date in the same team and recalculates forward. Use `2025-01-01` only when no earlier base snapshot exists or when the user explicitly requested a full rebuild from that date. `{latest-required-date}` is the latest changed summary snapshot date or the requested triage date, whichever is later.

Do not run accumulated-action rebuild after each individual object inside the same distillation batch. The rebuild belongs at the end of the full distillation run.

Do not skip directly to actions. `Insight` should follow from evidence, memory, and tension first.

## Large Batch Protocol

Use this protocol when the requested distillation scope is too large for one agent to author comfortably in a single pass.

1. Run `scripts/distillation-find-refresh-targets.js` for the requested scope to identify missing or stale summaries. The audit excludes closed-style source snapshots and reports the excluded count.
2. Write a fixed manifest under `my-work/{yyyy}/{mm}/{dd}/` that records each `source_path`, `summary_path`, batch ID, year/team scope, first source, last source, and count. The manifest is a routing artifact only.
3. Split the manifest into batches of up to 100 objects. Tail batches may be smaller.
4. If the user explicitly approves parallel agents, assign each worker one batch and a disjoint write set. Workers may write only assigned sibling `*-summary.md` files.
5. Workers must read assigned source files and author summary content directly from this process, `process/summary.md`, section guides, object overlays, and any needed scenario file. Workers may use scripts only for listing/checking assigned paths and validation.
6. If a worker authors multiple summaries in a single batch handoff file, the file must contain complete `summary-target` Markdown blocks. `scripts/split-agent-authored-summaries.js` may then split those completed blocks into sibling `*-summary.md` files after validating target path, frontmatter, required sections, evidence bullets, and source-file existence. The splitter copies agent-authored text byte-for-byte; it must not synthesize, rewrite, fill, or improve judgment.
7. Workers must not run accumulated-action rebuilds, rebuild `data/index/`, update progress notes, edit scripts, or touch unrelated files.
8. The parent agent reconciles completed batches by running the target audit, full validation, accumulated-action rebuilds once per affected team/date range, and `scripts/build-data-index.js`.
9. Completion requires zero remaining audit targets for the requested scope and zero validation failures.

Do not use script-authored summaries as a shortcut. If summaries were created by a script, template, mechanical migration, or bulk transform, remove or replace them with agent-authored summaries before calling the run valid. Structural validation is necessary but not sufficient; the workflow must also preserve agent-authored judgment from the current evidence layer.

## Output Paths

For a dated snapshot:

```text
data/{teamId}/{yyyy}/{mm}/{dd}/accounts/{id}/account-{id}-summary.md
data/{teamId}/{yyyy}/{mm}/{dd}/contacts/{id}/contact-{id}-summary.md
```

`action.md` is not generated during distillation.

## Summary Rules

- `summary.md` must follow `process/summary.md` exactly.
- `## Memory`, `## Confidence`, and `## Review Notes` are always present.
- `## Tensions`, `## Insight`, and `## Proposed Actions` are conditional sections.
- Every material statement must be grounded in the same-snapshot `source.md`.
- Preserve local checkbox state when refreshing `## Proposed Actions` and supported actions still exist.
- Keep the output franchise-specific.

## Action Queue Rule

When supported actions exist, keep them in `## Proposed Actions` inside `summary.md` as Markdown checkboxes. When supported actions do not exist, omit `## Proposed Actions`. The accumulated-action script reads summaries directly and detects additions, carries, checked completions, removed actions, and summaries that no longer contain supported actions.

Each proposed-action checkbox must be atomic. Do not combine separate confirmation, assessment, proposal, or escalation jobs into one checkbox when they can have different owners or completion states. Keep the first sentence short enough to become an Inbox `ActionTitle`; put purpose and rationale in nested bullets instead of a `Purpose:` clause on the checkbox line.

When an account or contact becomes inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up, it is excluded from normal distillation. Do not refresh the summary just to say it is inactive. Rebuild accumulated actions so the closed source snapshot removes old rows with `closed-status`.

## Scenario Use

Scenario classification belongs in the judgment phase, not in `source.md`.

If the evidence clearly supports one of the scenario lenses below, read the matching process file before drafting `summary.md`:

- `renewal`
- `ownership transition`
- `recruiting`
- `competitive risk`

If no scenario clearly dominates, continue with a general relationship distillation.

Object overlays do not replace scenario workflow. Use the object overlay to shape memory extraction and posture, then use the scenario file to interpret the current business mechanism.

When an object overlay includes a `## Rule Table`, the table is mandatory during distillation. Scenario workflow can narrow or deepen interpretation, but it does not bypass the matched object-rule rows.

## Validation Checks

Before calling the distillation complete, confirm:

- `source.md` exists for the same object and snapshot and is current enough for the request
- closed-style `source.md` snapshots were excluded from distillation targets unless the user explicitly requested an exception
- any live account/contact search or note lookup used during resolution has been reproduced in the local source layer, or has been excluded from judgment and documented as a coverage gap
- `summary.md` exists and follows `process/summary.md`
- large batch manifests, if used, had disjoint write sets and each worker wrote only assigned sibling summaries
- scripts were not used to draft, migrate, template, bulk-transform, or write summary judgment
- the run established and preserved a traceability envelope covering source, object, coverage window, and current unknowns
- the correct object overlay was applied for the target type
- the overlay's `## Rule Table` was used during the run rather than treated as optional reference text
- every object-level memory, tension, judgment, or action can be traced to a matched rule row with satisfied `Key Input Fields` and `Minimum Trigger Threshold`
- every downstream statement can still be tied to a real source file, a real object, and a clear time window from the current source layer
- summaries apply the correct team objective before generic brand posture: team `0` retention plus supported contact commercial opportunity, team `6` prospecting, team `7` contact commercial-program targeting
- account summaries preserve the team objective and use brand posture as context rather than an override
- contact summaries preserve the person's relationship to the linked account and keep commercial-program opportunity separate from brokerage classification unless team `7` makes commercial-program targeting the primary objective
- no proposed action or judgment violates the matched row's `Prohibited Misuse` guardrail
- downstream memory, tension, insight, and action were refreshed or downgraded if newer evidence narrowed confidence or exposed missing support
- `## Memory`, `## Confidence`, and `## Review Notes` are present
- `## Tensions`, `## Insight`, and `## Proposed Actions` appear only when supported
- action rationale, preconditions, purpose, and local-state notes remain nested under `## Proposed Actions` rather than becoming extra top-level summary sections
- no section contains raw field dumps that belong in `source.md`
- no `action.md` is created during distillation
- structural validation has passed, and any relevant semantic contract cases under `eval/` have been checked for judgment quality
- final parent-level audit, validation, accumulated-action rebuild, and index rebuild were run when the batch changed supported actions or routing state

## Do Not Do

- do not invent judgment not supported by `source.md`
- do not use scripts, templates, mechanical migrations, or old summaries to draft or rewrite `summary.md`
- do not put scenario labels into `source.md`
- do not create `action.md`
- do not treat local checkbox state as CRM state
- do not present proposed actions as external writes or completed tasks
