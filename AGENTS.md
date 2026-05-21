# CRM AI Workspace Instructions

## Purpose

This workspace connects AI agents to prepared evidence from a real estate franchising CRM. Deterministic scripts may generate factual `source.md` files from local exports; agents use those source files to create durable knowledge about franchise relationships, retention risk, recruiting opportunity, brokerage health, and next actions. Read-only CRM API helper scripts may be used for lookup, disambiguation, and note inspection, but durable judgment still starts from generated local evidence.

Do not treat this as a generic CRM. Every synthesis should answer the franchise business question: what does this mean for affiliation, retention, growth, service value, compliance, ownership, territory dynamics, or competitive risk?

## Workspace Contract

This is an event-driven AI workspace:

```text
event + current local state -> selected process handler -> new or updated state, output, or direct response
```

Events include user requests, source-generation runs, action-driven triage, account/contact synthesis, scenario analysis, report/deck output, validation runs, audit runs, scheduled reviews, and manual operator decisions.

Host assumptions:

- The agent host can read and write workspace files when the selected process handler requires it.
- The agent host can create parent folders under `data/` and `my-work/`.
- The agent host can run local shell commands, source-generation scripts, deterministic export tools, and documented read-only CRM API helper scripts when needed.
- The agent host does not call undocumented CRM endpoints directly from this workspace.
- The agent host does not write back to the CRM from this workspace.

Handler selection:

1. Classify the event: source generation, layered account/contact synthesis, daily triage, scenario analysis, report/deck output, validation, or audit.
2. Read the narrowest matching file under `process/`.
3. Search and read only the current local state needed from `data/`.
4. If a needed `*-source.md` file is missing or stale and local exports are available, run the relevant source-generation script before distilling judgment.
5. Run distillation and daily triage directly from the selected process handler rather than through a script. Scripts may load, queue, or list batches, but must not draft or write `summary.md`.
6. Apply the selected handler's read, write, output, and validation rules.

Large distillation runs must use the compliant agent-authored batch pattern:

1. Audit missing or stale summaries with `scripts/distillation-find-refresh-targets.js`.
2. Create a fixed manifest under `my-work/{yyyy}/{mm}/{dd}/` when the run is large enough to split, recording source paths, summary paths, batch IDs, first/last source, and count. This manifest is routing state only, not evidence.
3. Split work into disjoint batches of up to 100 objects. Smaller tail batches are allowed.
4. If the user explicitly approves parallel agents, assign each worker one batch and clear write ownership: the worker may write only its assigned sibling `*-summary.md` paths and must not rebuild indexes, rebuild accumulated actions, edit progress notes, or touch unrelated files.
5. Each worker must read the assigned `*-source.md` files and author `summary.md` content directly from `AGENTS.md` plus the relevant `process/` files. A worker may use scripts only to list/check its assigned targets and validate outputs.
6. Do not use scripts, templates, mechanical migrations, bulk transforms, or old summaries to draft or rewrite summary content. Existing summaries may be read only as historical context when the process allows it; the current `summary.md` text still has to be agent-authored from the current source layer.
7. After workers finish, the parent agent runs the final year/team audits, full validation, accumulated-action rebuilds once per affected team/date range, and `scripts/build-data-index.js`.
8. Do not claim completion until the audit reports zero remaining targets for the requested scope and `scripts/distillation-validate-outputs.js` reports zero failures.
9. If a noncompliant script-authored summary pass is discovered, remove or replace those summaries before proceeding. Do not treat structural validation as proof that the distillation workflow was followed.

Durable knowledge belongs in `data/`. Behavior rules belong in `process/`. Dynamic operator work such as briefings, reports, and analyses belongs in `my-work/{yyyy}/{mm}/{dd}/`, except daily triage which belongs in `my-work/daily-triage/{yyyy}/{mm}/{dd}/`. Generated operator deliverables for that work belong in the matching dated `output/` folder under the selected work path.

External write boundary: this workspace does not write CRM account, contact, or note records. Local summaries, checkboxes, reports, decks, and proposed actions are planning artifacts unless the user explicitly asks to publish action artifacts. The only permitted CRM write scripts are `scripts/post-accumulated-actions.js` for the `Actions` table through `POST /api/data/actions` and `scripts/post-inbox.js` for the `Inbox` table through `POST /api/data/inbox`. Both scripts must require their explicit write-enable environment variable and support dry-run validation. Do not use the actions-table script for inbox rows, and do not use the inbox script for accumulated markdown snapshots.

Validation expectation: do not claim a workflow is validated unless the relevant event path has been checked against its handler, expected `data/` reads or writes, expected `my-work/` artifacts, and any required export result.

## File Map

- `scripts/refresh-crm-data.js`: end-to-end CRM refresh entrypoint that runs the raw API download, dated export expansion, source regeneration, and routing-index rebuild workflow.
- `scripts/search-index.js`: local read-only index search helper over `data/index/` for exact name lookup, token fallback, type filtering, source coverage filtering, open-action filtering, JSON output, and path-oriented routing output. Use this before API lookup for ordinary account/contact resolution.
- `scripts/search-crm.js`: gated read-only CRM lookup helper that requires `.env` or environment `AIW_ENABLE_CRM_API=1` before it reads `CRM_BASE_URL` and `CRM_ACCESS_TOKEN`, calls documented account/contact search endpoints from `api.yaml`, and can fetch related account/contact notes for inspection.
- `scripts/build-date-tree.js`: expands local CRM exports into team-scoped dated account/contact and note files under `data/{teamId}/{yyyy}/{mm}/{dd}/`. CRM team `-1` is normalized to workspace team `0`.
- `scripts/generate-source.js`: creates or refreshes factual in-place `*-source.md` files from dated local exports.
- `scripts/load-distillation-batch.js`: read-only batch loader for agent-authored distillation. It lists source and summary paths plus object metadata; it must not write `summary.md`.
- `scripts/build-data-index.js`: rebuilds deterministic routing indexes under `data/index/` from raw local exports and generated layer files.
- `scripts/build-accumulated-actions.js`: creates deterministic team-scoped dated accumulated-action queue snapshots and removed-action files under `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/` from in-place `summary.md` artifacts, including added, carried, and removed actions from `## Proposed Actions`. Snapshot action rows expose business fields such as team ID, account/contact identity, action text, first/last seen dates, source date, and latest summary path; internal normalized action keys, stale summary paths, and status fields are not output fields.
- `scripts/post-accumulated-actions.js`: gated CRM write helper for publishing one accumulated daily markdown report per team/date to the CRM `Actions` table through `POST /api/data/actions`. This is for snapshot/audit text only, not inbox work items. It requires `AIW_ENABLE_CRM_ACTION_POST=1` unless `--dry-run` is used.
- `scripts/post-inbox.js`: gated CRM write helper for upserting checkbox-level inbox work items to the CRM `Inbox` table through `POST /api/data/inbox`. It parses account/contact checkbox actions from `actions-{yyyy-mm-dd}.md`, derives `actionKey`, and requires `AIW_ENABLE_CRM_INBOX_POST=1` unless `--dry-run` is used.
- `scripts/distillation-find-refresh-targets.js`: audits dated `source.md` and `summary.md` coverage for missing summaries, missing `## Evidence`, stale generic phrasing, and expired summaries.
- `scripts/distillation-validate-outputs.js`: validates dated `summary.md` artifacts for required frontmatter, required sections, evidence-traceability bullets, and source-file existence.
- `api.yaml`: read-only API contract reference for CRM account, contact, and note endpoints used by helper scripts. Do not infer undocumented API behavior when this contract is missing a route.
- `process/accumulated-actions.md`: deterministic accumulated-action queue snapshot process, including trigger phrases, base snapshot rules, JSON shape, and removal logic.
- `process/daily-triage.md`: workflow for action-driven daily attention briefings with a required three-file Marp/PDF export pattern: executive summary, what's new today, and full references. The executive summary carries decision intelligence and the action map, what's new today isolates same-day adds/carries/removals, and full references carries the complete action traceback list.
- `process/source.md`: evidence-layer contract for generated CRM source snapshots.
- `process/distillation.md`: orchestration workflow from `source.md` to `summary.md`.
- `process/summary.md`: combined judgment-layer contract for memory, tension, insight, and proposed actions.
- `process/memory.md`: section guidance for the `Memory` section inside `summary.md`.
- `process/tension.md`: section guidance for the `Tensions` section inside `summary.md`.
- `process/insight.md`: section guidance for the `Insight` section inside `summary.md`.
- `process/action.md`: section guidance for the `Proposed Actions` section inside `summary.md`.
- `process/renewal.md`: workflow for renewal and term-risk analysis.
- `process/ownership-transition.md`: workflow for ownership transfer, succession, and leadership-change analysis.
- `process/recruiting.md`: workflow for recruiting opportunity, attrition, and affiliation-movement analysis.
- `process/competitive-risk.md`: workflow for competitor pressure and brand-loss analysis.
- `.docs/Knowledge Distillation and the Layered Knowledge Base.md`: conceptual model for layered local knowledge.
- `data/`: durable local source evidence, raw API exports, and layered knowledge.
- `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/`: deterministic accumulated-action queue snapshots and removed-action files generated from dated summaries for that team.
- `data/index/`: deterministic routing indexes for resolving account/contact IDs, latest layer paths, source inventory, open actions in summaries, and dated bucket counts. Index rows are not evidence.
- `data/raw/`: raw JSON exports downloaded from the API. Notes live in `my-notes.json`, while accounts and contacts live in team-scoped `accounts-*.json` and `contacts-*.json` files.
- `data/{teamId}/{yyyy}/{mm}/{dd}/`: team-scoped dated local exports, generated sources, and summaries. Use `data/0/...` for CRM team `-1`.
- `my-work/{yyyy}/{mm}/{dd}/`: dated dynamic work products such as briefs, reports, and analyses.
- `my-work/output/{yyyy}/{mm}/{dd}/`: dated final `.pptx`, `.pdf`, `.marp.md`, and other generated deliverables.
- `my-work/output/{yyyy}/{mm}/{dd}/scratch/`: scratch artifacts, previews, generated source, and intermediate files for that dated output run.
- `my-work/daily-triage/{yyyy}/{mm}/{dd}/`: dated daily triage briefs.

## Local Source Rules

Agents may use documented read-only CRM API helper scripts for lookup, disambiguation, and note inspection only when `AIW_ENABLE_CRM_API=1` is set. The durable evidence boundary for layered knowledge remains the local generated `*-source.md` file.

When the user asks for new, fresh, latest, refreshed, synced, or downloaded CRM data, use `node scripts/refresh-crm-data.js` as the default refresh entrypoint. Treat those requests as a full local CRM refresh unless the user explicitly asks only for raw/root JSON exports under `data/raw/`.

When the user asks to find, search, or look up an account/contact without asking for durable synthesis, use `node scripts/search-index.js` first for local resolution:

```text
node scripts/search-index.js "Jazz Gill"
node scripts/search-index.js --type=contacts "Jazz Gill"
node scripts/search-index.js --type=accounts "Royal LePage Next Level"
node scripts/search-index.js "Next Level" --type=accounts --has-source
node scripts/search-index.js "Royal LePage Next Level" --has-open-action --paths
node scripts/search-index.js "Jazz Gill" --agent
```

Use `node scripts/search-crm.js` only when `AIW_ENABLE_CRM_API=1` is set and the user asks for live, fresh, latest, or CRM-current data; asks to inspect notes; the local index is missing, stale, ambiguous, or contradicted by the task; or the local result needs confirmation against recent CRM changes. This helper is allowed to call only the read endpoints documented in `api.yaml`, including:

```text
node scripts/search-crm.js "Jazz Gill"
node scripts/search-crm.js --type=contacts "Jazz Gill"
node scripts/search-crm.js --type=accounts "Royal LePage Next Level"
node scripts/search-crm.js --include-notes "Jazz Gill"
node scripts/search-crm.js --type=contacts --notes-only "Jazz Gill"
```

Live lookup output is inspection evidence, not a durable layer. If a live lookup reveals a record or note missing from local exports and the user asks for synthesis, source generation, triage, a report, or durable memory/action work, refresh local CRM data first and regenerate the matching `source.md` before distilling judgment. If the refresh cannot reproduce the live evidence locally, report the coverage gap instead of moving the live result into `summary.md`.

Use source generation when the user asks for fresh account/contact evidence, when the matching `*-source.md` file is missing, or when dated exports exist but the source layer has not been generated yet.

Default source-generation script flow:

```text
node scripts/build-date-tree.js
node scripts/generate-source.js --year={yyyy} --overwrite
node scripts/build-data-index.js
```

Distillation and daily triage briefing are AI-agent workflows. Do not use scripts to create `summary.md`, daily triage briefs, Marp files, or PDFs. Scripts may load or list source batches for an agent to process, and may create deterministic accumulated-action queue snapshots from existing local `summary.md` artifacts.

For large distillation runs, follow the fixed-manifest parallel-agent protocol from the Workspace Contract. Parent agents own orchestration, progress notes, final validation, accumulated-action rebuilds, and index rebuilds. Worker agents own only their assigned `*-summary.md` files. This separation is part of the evidence boundary: deterministic scripts may organize work and derived state, but judgment text must be written by agents from the current `*-source.md` files.

Run accumulated-action calculation automatically once at the end of a distillation run, after all requested accounts and contacts have been distilled, if any account/contact created, updated, or deleted `## Proposed Actions` inside a dated `*-summary.md` artifact. Do not rebuild the queue after each individual account/contact inside the same batch. Track the earliest changed summary snapshot date and latest required as-of date, then run one rebuild:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}
```

The `{teamId}` is the workspace team folder ID; CRM team `-1` uses `0`. The default `{start-date}` is the earliest changed action snapshot date unless a full rebuild is requested; the script seeds from the latest existing accumulated snapshot before that date in the same team. Use `2025-01-01` only when no earlier base snapshot exists or when the user explicitly asks to rebuild from that date. The `{as-of-date}` is the latest changed action snapshot date or the requested triage date, whichever is later.

When rebuilding from a `{start-date}`, the script should seed from the latest existing accumulated snapshot before `{start-date}` and recalculate `{start-date}` forward. It should start blank only when no earlier base snapshot exists. Do not use the same-day snapshot as the base for a rebuild from that day, because that would hide same-day action additions or removals.

Also run accumulated-action calculation when the user asks for `accumulated actions`, `rebuild action queue`, `refresh action queue`, `recalculate triage`, `build daily triage state`, `update accumulated queue`, `backfill action queue`, `as-of triage state`, or equivalent wording.

Publishing accumulated actions and inbox items:

- `scripts/post-accumulated-actions.js` posts accumulated daily markdown snapshots to the CRM `Actions` table only. Use it when the user asks to post accumulated action reports, action markdown, or daily action snapshots. For team-scoped daily reports, use `--team-file`; `data/0/...` maps to API team `8` in this snapshot route when that API expects the CRM team identifier. This script is not for inbox upserts.
- `scripts/post-inbox.js` posts checkbox-level work items to the CRM `Inbox` table only. Use it when the user asks to upsert inbox items, publish inbox work, or send checkbox actions to the inbox. The default date is today; `--date=YYYY-MM-DD` selects another daily triage date across all available team files. For inbox rows, map workspace team `0` or CRM team `-1` to API team `8`.
- Do not confuse the two destinations: accumulated markdown snapshots belong in `Actions`; normalized checkbox work items with `actionKey` belong in `Inbox`.
- Both posting scripts must be dry-run first when payload shape or route behavior changed. Actual writes require the script-specific environment gate: `AIW_ENABLE_CRM_ACTION_POST=1` for `Actions`, `AIW_ENABLE_CRM_INBOX_POST=1` for `Inbox`.

Do not invent facts when source coverage is missing. Report the missing local source coverage and, when possible, name the script or export needed to create it.

## Data Lookup Rule

For business data under `data/`, assume entity names and business facts are stored inside file contents, not in file or folder names. Search content, not file or folder names. For account/contact resolution, use `scripts/search-index.js` first when `data/index/` exists and is current enough for the task. Use `scripts/search-crm.js` only when `AIW_ENABLE_CRM_API=1` is set and the user asks for live/fresh/latest CRM data, note inspection, recent-change confirmation, or the local index result is missing, stale, ambiguous, or contradicted by the task; then reconcile the API result back to local exports or generated sources before synthesis. If the API helper is unavailable or the task must stay local-only, search file content in the raw team-scoped exports such as `data/raw/accounts-*.json` and `data/raw/contacts-*.json`, then narrow to dated account/contact artifacts only after a content match identifies the account/contact. When resolving accounts or contacts inside dated buckets under `data/{teamId}/{yyyy}/{mm}/{dd}/`, continue using content search such as `rg` against file contents rather than searching dated path names. Do not use wildcard file or folder searches such as `*` or `**`. Do not use file listings or directory listings as a search method. Search exact phrases first, then token variants, then open only the top matching files. List files or directories only when the user explicitly asks for file structure, when navigating to a known account or contact ID, or when a script workflow requires traversal of dated storage layout. Do not do business-name searches in file or folder names. Use file or folder name search only when resolving a known account/contact ID plus team/date path, or when working with implementation files, config files, schemas, scripts, or storage layout.

`data/index/` is a deterministic routing aid, not an evidence layer. Use it first when it exists and appears current enough for the task to resolve likely account/contact IDs, latest source paths, latest summary paths, and open actions in summaries. After selecting a candidate from the index, read the referenced in-place `*-source.md` and any needed sibling layer files before analysis. Do not use index rows as the evidence boundary for franchise judgment.

If the index is missing, stale, or ambiguous, fall back to content search in `data/raw/accounts-*.json`, `data/raw/contacts-*.json`, generated source files, summaries, proposed actions inside summaries, and dated work artifacts. Rebuild the index with `node scripts/build-data-index.js` after source generation or when local layer files have changed materially.

Use local source files to fill evidence needs. If existing source files are enough for the user's question, use them before regenerating. If the needed evidence is absent from local sources, run source-generation scripts only when the required local exports are present; otherwise state the evidence gap.

When local layer files are needed, gather the relevant in-place layer file paths and read them together in one shell command, for example:

```text
cat data/0/2026/05/14/contacts/4539/contact-4539-source.md data/0/2026/05/14/contacts/4539/contact-4539-summary.md
```

Once the target file paths are selected, read them directly; do not first check whether the paths exist with separate listing, `find`, `test`, or similar probe commands. Do not issue separate file reads for each layer file, such as individual reads for `source.md` and `summary.md`.

## Layered Knowledge Workflow

Use layered knowledge for open-ended CRM questions such as:

- "What's going on with Jazz Gill?"
- "What should we do about this account?"
- "Summarize the relationship risk."
- "What changed since last time?"
- "Create a presentation about this contact/account."

Account/contact resolution:

1. Resolve the supplied name with `node scripts/search-index.js` when the local index exists and is current enough for the task.
2. Use `node scripts/search-crm.js` only when `AIW_ENABLE_CRM_API=1` is set and the user asks for live/fresh/latest CRM data, note inspection, recent-change confirmation, or the index result is missing, stale, ambiguous, or contradicted by the task.
3. For synthesis, reports, summaries, actions, triage, or durable memory work, API output is not durable evidence. Refresh local CRM data when needed, regenerate the matching `source.md`, and only then produce judgment-layer work. If live lookup finds a clear record that is absent from local exports, report the local durable coverage gap instead of using the live result as source-backed evidence.
4. If live lookup is unavailable or the task must stay local-only, search local account and contact content starting with `data/raw/accounts-*.json` and `data/raw/contacts-*.json`.
5. If local search resolves one clear match and the local source file is sufficient for the request, use it.
6. If the match is clear but `source.md` is missing and dated local exports exist, run the source-generation script.
7. If multiple plausible matches exist, ask the user to choose.
8. If no local or live match exists, ask for a better identifier or for the missing local export/source coverage to be generated.

For follow-up work on an already known account or contact ID, check the recent dated in-place layer files for that account/contact before regenerating source files. When dated layer files are needed, read the selected sibling paths together with one shell command rather than one at a time.

Persist layered knowledge under:

```text
data/{teamId}/{yyyy}/{mm}/{dd}/
  accounts/{id}/
    account-{id}-data.json
    account-{id}-source.md
    account-{id}-summary.md
  contacts/{id}/
    contact-{id}-data.json
    contact-{id}-source.md
    contact-{id}-summary.md
```

Use the layer process files as the source of truth:

- `process/source.md`
- `process/distillation.md`
- `process/summary.md`

Use `process/distillation.md` to orchestrate the judgment-layer flow from `source.md` into `summary.md`. Use `process/memory.md`, `process/tension.md`, `process/insight.md`, and `process/action.md` only as section-level guidance while composing `summary.md`.

Create or refresh `source.md` before producing `summary.md`. `source.md` is the evidence contract for what the generated local source says, what fields matter, and what remains unknown.

When the task is distillation rather than fact gathering, start from the matching in-place `*-source.md`, follow `process/distillation.md`, and produce the sibling `*-summary.md`. Put supported actions in the summary's `## Proposed Actions` section; do not create `action.md`.

Distillation is an AI-agent workflow, not a script workflow. Scripts may load or list batches, but the agent must follow `AGENTS.md` and the relevant `process/` files step by step when writing summaries.

When the request covers many objects, use the approved batch pattern:

- Audit the scope first.
- Freeze target ownership in a dated manifest under `my-work/{yyyy}/{mm}/{dd}/`.
- Use batches of up to 100 objects.
- Assign parallel workers only when the user explicitly approves parallel agents.
- Give every worker a disjoint write set of sibling `*-summary.md` files.
- Require each worker to author summaries from current source files, not from scripts or templates.
- Validate each batch and then run one parent-level final validation, accumulated-action rebuild, and index rebuild.
- Update progress notes with the real audit counts and validation results.

Before synthesizing, classify the run by franchise scenario in addition to account/contact type. Valid scenarios are:

- `renewal`: term health, renewal readiness, churn risk, or commercial renewal pressure.
- `ownership transition`: sale, succession, APA/IBA dependency, leadership turnover, or approval-gated transfer.
- `recruiting`: inbound recruiting opportunity, outbound attrition risk, team movement, or affiliation change.
- `competitive risk`: competitor encroachment, brand-switch risk, market share pressure, or service-driven vulnerability.
- `general relationship`: open-ended account/contact understanding when none of the above dominate.

If a scenario applies, read the matching process file before producing `summary.md`.

## Daily Triage Workflow

Use daily triage for action-driven prompts such as:

- "What needs attention today?"
- "Brief me on today's CRM activity."
- "Find the accounts and contacts that need attention."
- "Create a daily triage deck/PDF."

Daily triage has two view types:

- `triage`: the default briefing view based on a deterministic accumulated-action queue snapshot for one as-of date. The queue starts from the configured queue start date, defaulting to `2025-01-01`, and is built by script so each day adds new supported actions, carries forward still-needed actions, and records removed actions.
- `lookback`: a rolling X-day or explicit date-range review used to answer what happened or changed in that period. Lookback is for discovery and retrospective review; it is not the standing queue.

Daily triage does not replace deeper account/contact-level layered synthesis on a single account or contact.

Daily triage is an AI-agent workflow, not a script workflow.

Default view and scope rules:

- If the user asks what needs attention today, asks for daily triage, or asks for a briefing without a retrospective period, use `view_type: triage`.
- If the user asks what happened over `3 days`, `2 weeks`, `one month`, `today only`, `since midnight`, or an explicit date range, use `view_type: lookback`.
- For `triage`, use the accumulated-action snapshot for the requested team and as-of date. If the user does not specify a team, keep team queues separate rather than merging them. The default queue start date is `2025-01-01` unless the user or accumulated snapshot states another start date.
- For `lookback`, normalize relative scopes to an inclusive day count for filenames. Examples: `3 days` -> `3`, `2 weeks` -> `14`, `one month` -> `30`.
- Preserve the selected view type, start date or lookback scope, written brief filename, executive-summary Marp/PDF filenames, what's-new-today Marp/PDF filenames, full-reference Marp/PDF filenames, and evidence-reference filenames consistently.

Daily triage run rules:

1. Read `process/daily-triage.md` before collecting artifacts or generating outputs.
2. Set `view_type` to `triage` or `lookback` from the user's request.
3. For `triage`, read the accumulated-action snapshot for the requested team and as-of date under `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/`. If it is missing or stale, run `node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}` before briefing. Use `--team=0` for CRM team `-1`.
4. For `lookback`, read accumulated-action snapshots and related summaries only from the requested rolling or explicit date range and summarize what appeared, changed, persisted, or cleared inside that period.
5. Treat `changes_on_date.removed` and lookback removals as first-class facts. Do not infer removal from silence; use the accumulated snapshot's removed-action records or a source-backed dated summary transition. Removal reasons include `checked-or-completed`, `closed-status`, `no-supported-actions-in-summary`, and `not-present-in-latest-action`.
6. Rank the resulting accounts, contacts, and action states by franchise consequence and immediacy, escalating triage items that remain unresolved across repeated runs.
7. Use the accumulated snapshot's active actions as the `triage` state base and its added/carried/removed change records as status context. Use the matching `actions-{yyyy-mm-dd}.md` file as the readable account/contact evidence layer for active actions, insights, tensions, and memory.
8. Store the dated written brief under the view-specific filename defined in `process/daily-triage.md`.
9. Use that written brief as the required source of truth when generating daily triage Marp files. Do not build new files by reusing or adapting older Marp files without first regenerating or rereading the matching written brief.
10. Always create three view-specific Marp files under `my-work/output/{yyyy}/{mm}/{dd}/` and export matching PDFs under the same dated folder:
   - Executive summary: concise decision readout and action map.
   - What's new today: same-day adds, carries, removals, and fresh signals only.
   - Full references: complete action traceback list.
11. Structure the executive summary as intelligence first, not as a thin summary. It should include queue age/staleness, business-lane segmentation, brand posture, consequence ranking, backlog hygiene, and an action map before account/contact examples. Write this file in plain business language for executives: use terms such as `current opportunities`, `older follow-ups`, `ownership or sale risk`, `retention risk`, `recruiting opportunity`, `relationship owner`, and `next decision`. Avoid internal terms such as `artifact`, `snapshot`, `traceback`, `JSON`, `source layer`, `queue hygiene`, or file paths in visible slide text unless the user explicitly asks for technical detail. In visible slide text, use `accounts and contacts`, `accounts`, `contacts`, `relationships`, or `opportunities` as appropriate.
12. Structure the what's-new-today file as the fresh-change readout. It should not repeat the full active queue except where same-day carry-forward or removal context is necessary.
13. Structure the full-reference file as one visible reference slide per in-scope account or contact. For `triage`, include all active accounts and contacts from the generated action report file. Each account/contact slide must show the action chain: `Actions -> Insight -> Tensions -> Memory`. For `lookback`, include every account or contact with an action add, change, persistence signal, completion, supersession, or removal in the selected range. In visible slide text, label each reference as an account or contact, never as a generic item.
14. Keep the executive readout franchise-specific: retention, recruiting, ownership, brokerage health, service risk, and next move. Keep the full-reference file audit-oriented, not narrative.

## Franchise Entity And Scenario Rules

- Do not treat `accounts` and `contacts` as sufficient business meaning on their own. State whether the evidence is primarily about a brokerage, owner, operator, team leader, agent, office, territory, or franchise relationship.
- Route distillation by workspace team before generic brand posture:
  - Team `0`: Royal LePage accounts and contacts. Primary objective is retention; contact-level commercial-program potential is a secondary objective when supported.
  - Team `6`: Non-Royal-LePage accounts and contacts. Primary objective is prospecting.
  - Team `7`: Non-Royal-LePage commercial / Royal LePage commercial accounts and contacts. Primary objective is contact-level commercial-program targeting; do not turn this lane into brokerage retention or brokerage prospecting unless source evidence separately supports it.
- Classify brokerage brand posture explicitly. Royal LePage brokerages are in-brand franchise relationships and default to retention focus. Non-Royal LePage brokerages are out-of-brand prospecting targets unless current source evidence shows another posture the user explicitly asked to analyze.
- Keep brokerage posture separate from contact/agent program posture. A contact- or agent-level commercial program may target people inside both Royal LePage and non-Royal-LePage brokerages without reclassifying the brokerage itself.
- For people-level analysis, Royal LePage agents default to agent retention. They may also be commercial-program targets when eligible, but commercial-program eligibility does not replace the retention posture.
- In team `7`, commercial-program targeting is the primary lens for both accounts and contacts. For account summaries, preserve the brokerage context only to explain access, eligibility, and relationship path to commercial contacts; do not summarize the account as a retention/prospecting account by default.
- When a contact-level signal could affect a wider business unit, classify the scope explicitly as `isolated`, `team`, `brokerage`, or `market`.
- Distinguish `retain` from `recruit` even when the same person or team movement could be framed either way. If the business is trying to prevent departure, it is retention first.
- Distinguish `confirmed`, `in progress`, `rumored`, and `stale/unclear` states. Do not collapse them into one risk label.
- Surface critical unknowns explicitly when the source evidence does not support a franchise conclusion. Unknown renewal stage, ownership stage, decision-maker, or competitor status must remain unknown rather than inferred.
- Do not generalize from a single agent or note into brokerage-wide health unless the evidence supports a broader pattern.

## Scenario Minimum Evidence

When a scenario applies, gather from `source.md` or explicitly mark unknown:

- Renewal: contract end or renewal timing, current owner/decision-maker, owner sentiment, service issues, commercial/legal blockers, competitor mentions, brokerage health signals.
- Ownership transition: current and incoming owner, transfer stage, APA/IBA or approval dependencies, leadership continuity, affected offices/agents, succession risk, territory or compliance dependencies.
- Recruiting: source and target brand/brokerage, whether the brokerage is Royal LePage or non-Royal LePage, whether the person is a Royal LePage agent who should default to agent retention, whether the question is brokerage posture or contact/agent commercial-program targeting, person or team influence level, movement stage, scope of movement, owner sensitivity, and whether the franchise posture is retention, prospecting, or cross-brand commercial targeting.
- Competitive risk: competitor identity, asset at risk, threat mechanism, freshness of evidence, scope, and whether the signal is isolated or patterned.

## Local Durable Asset TTL

Each in-place layer file must include frontmatter with `created_at`, `updated_at`, `ttl`, `expires_at`, `status`, `source_date`, and `source_files`.

Default TTLs:

- `source.md`: no TTL; evidence snapshot.
- `summary.md`: `P3D`.

Before relying on an older in-place `*-summary.md`, check `expires_at`. Expired summaries are historical context only.

For `*-source.md`, `ttl` remains `none`, but the file still needs current frontmatter and should be refreshed whenever local exports add newer evidence for that dated snapshot.

For `*-summary.md`, use the `P3D` default unless the run needs a shorter TTL because the judgment depends on a near-term event, meeting, or unresolved action.

Actions must use Markdown checkboxes:

```md
- [ ] Action item
- [x] Completed action item
```

Preserve checkbox state when updating the `## Proposed Actions` section inside `summary.md`. These checkboxes are local planning artifacts only.

## Franchise Judgment Lens

When transforming source evidence into memory, tensions, insights, or actions, prioritize:

- Recruiting and affiliation opportunity.
- Retention, renewal, and churn risk.
- Brokerage health and owner confidence.
- Ownership, succession, and leadership dynamics.
- Territory, market, and competitive pressure.
- Relationship influence and internal champions.
- Service value gaps and operational friction.
- Compliance, legal, finance, and support dependency.
- Concrete next action, owner, timing, and business consequence.

Interpret the team objective first, then use brand posture inside that objective. Team `0` is retention-first with supported contact commercial-program opportunity as a secondary lane. Team `6` is prospecting-first. Team `7` is contact-commercial-program-first even when the linked brokerage is Royal LePage or non-Royal-LePage.

Brand posture still matters, but it no longer overrides the team lane. Royal LePage brokerages in team `0` should be analyzed for retention, renewal strength, and internal growth protection. Non-Royal-LePage brokerages in team `6` should be analyzed for prospecting upside. Team `7` should focus on which people, roles, offices, or accounts create a commercial-program path.

When the analysis is explicitly about a contact- or agent-level commercial program, allow cross-brand targeting across both Royal LePage and non-Royal-LePage brokerages, but keep the brokerage relationship classification unchanged.

For Royal LePage agents, start with agent retention as the default people-level posture, then add commercial-program targeting only if eligibility is supported by the user request or source evidence.

Avoid vague CRM summaries. State what changed, why it matters, and what the franchise team should do next.

Prefer scenario-specific judgment over generic account-management language. Renewal, ownership transition, recruiting, and competitive-risk signals should be analyzed with the corresponding process contract when present.

## Output Rules

Create final presentation deliverables under `my-work/output/{yyyy}/{mm}/{dd}/`. Scratch files, rendered previews, generated source, and intermediate files belong under `my-work/output/{yyyy}/{mm}/{dd}/scratch/`.

Write dated dynamic working artifacts such as briefs, reports, analyses, and intermediate decision documents under `my-work/{yyyy}/{mm}/{dd}/`.

If the selected workflow is a briefing workflow, always create the presentation as Marp Markdown and export a matching PDF. Do not create a PDF directly without a corresponding `.marp.md` source file.

If the selected workflow is a briefing workflow, or the user explicitly asks for Marp, PDF, or a natural-language equivalent such as "PDF deck", "Marp presentation", "slide deck in PDF", or "one-pager deck as PDF", treat that as a request for a Marp-authored presentation. In that case:

- Create the Marp source under `my-work/output/{yyyy}/{mm}/{dd}/` with a `.marp.md` filename.
- Export the final PDF under the same dated `my-work/output/{yyyy}/{mm}/{dd}/` folder.
- Use the default briefing storyline only when the user does not provide a custom storyline or slide outline. When the user supplies their own deck storyline or outline, follow it.
- For daily triage briefings, always create three Marp/PDF deliverable pairs:
  - Executive summary: `daily-triage-{yyyy-mm-dd}-{view-scope}-executive-summary.marp.md` and `.pdf`.
  - What's new today: `daily-triage-{yyyy-mm-dd}-{view-scope}-whats-new-today.marp.md` and `.pdf`.
  - Full references: `daily-triage-{yyyy-mm-dd}-{view-scope}-full-references.marp.md` and `.pdf`.
- For daily triage executive summaries, include real queue intelligence before recommendations: age/staleness, business-lane segmentation, brand posture, backlog hygiene, and concrete operating lanes. Translate those concepts into executive language on the visible slides. For example, say `fresh opportunities this week`, `older follow-ups to clean up`, and `ownership or sale situations that need a named relationship owner`. Use `accounts and contacts`, `relationships`, or `opportunities` in visible text.
- For daily triage what's-new-today files, isolate same-day adds, carries, removals, and fresh signals. Do not repeat the full active queue unless a same-day carry-forward needs context.
- For daily triage full-references files, include the full action traceback list as visible slides. For `triage`, this means all active accounts and contacts. Each account/contact slide must show `Actions`, `Insight`, `Tensions`, and `Memory`. Do not satisfy the full-reference requirement with a link-only appendix. Visible labels should say `account`, `contact`, or `account/contact`.
- Unless the user explicitly says `no references`, end the executive summary with a short reference pointer to the full-references file and cite the highest-priority supporting accounts and contacts.
- Keep previews, intermediate render artifacts, and generated support files under `my-work/output/{yyyy}/{mm}/{dd}/scratch/`.

If the user asks for "a briefing" without specifying format, default to Marp plus PDF under `my-work/output/{yyyy}/{mm}/{dd}/` and use the default briefing storyline only if the user has not provided a custom outline. For daily triage, this means the three-file executive-summary, what's-new-today, and full-references pattern. If the user asks for "a presentation" without specifying format and the request is not a briefing workflow, default to `.pptx` output under `my-work/output/{yyyy}/{mm}/{dd}/`.

Use generic relative workspace paths in documentation. Do not hardcode personal absolute paths.

## Non-Negotiables

- Use generated `source.md` files as the evidence boundary.
- Do not call or write to the CRM from this workspace.
- Search business facts inside file contents, not names.
- Run source-generation scripts only against local exports.
- Do not invent missing source coverage.
- Keep local actions local; checkboxes and proposed actions do not update CRM.
- Keep the analysis specific to real estate franchising.
