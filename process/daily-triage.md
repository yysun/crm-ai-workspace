# Daily Triage Process

## Purpose

Run a repeatable daily attention briefing from deterministic accumulated-action snapshots, then turn that briefing into a dated written summary plus three default Marp/PDF outputs: executive summary, what's new today, and full references.

Daily triage briefing is an AI-agent workflow. Agents author the written brief and Marp content. Deterministic renderers may export agent-authored Marp files to PDF. Use scripts only to build deterministic accumulated-action snapshots from existing local `summary.md` artifacts or to render already-authored presentation files; scripts must not author, rewrite, summarize, or adapt briefing content.

Read `process/accumulated-actions.md` when accumulated-action snapshots are missing, stale, manually requested, or need explanation.

This workflow answers questions such as:

- What needs attention today?
- Which accounts and contacts need follow-up?
- Brief me on today's CRM activity.
- Create a daily triage deck.

Daily triage is intended for queue shaping and executive visibility. It supports two view types:

- `triage`: the default briefing view. It reads one deterministic accumulated-action snapshot for an as-of date and turns the active queue plus same-day added, carried, and removed action records into a brief and three presentation files.
- `lookback`: a rolling X-day or explicit date-range view used to answer what happened, changed, persisted, or cleared in that period. It is useful for retrospective discovery, but it is not the standing triage queue.

This workflow does not replace deeper account/contact-level layered synthesis when the user asks for a full relationship readout on one account or contact.

## View Type And Scope

- Use `view_type: triage` when the user asks what needs attention today, asks for daily triage, asks for a briefing, or does not specify a retrospective period.
- Use `view_type: lookback` when the user asks what happened over `3 days`, `2 weeks`, `one month`, `today only`, `since midnight`, `this morning`, or an explicit date range.
- For `triage`, use the accumulated-action snapshot for the requested as-of date. The workspace default queue start date for building snapshots is `2025-01-01` unless the user or snapshot states another start date.
- Resolve team scope before reading triage state. If the user names a CRM team `-1`, use workspace team `0`. If no team is specified, produce separate team sections or outputs; do not merge accumulated queues across teams.
- For `lookback`, natural-language `today` means today only when the user explicitly asks for `today only`, `since midnight`, or equivalent. Otherwise a bare `today` triage prompt should use `view_type: triage`.
- For relative lookbacks, normalize the request to an inclusive day count for filenames. Examples: `3 days` -> `3`, `2 weeks` -> `14`, `one month` -> `30`.
- Preserve the requested scope after normalization. Example: `one month` means a rolling 30-day discovery lookback ending on the current date and must not fall back to the default 7-day lookback.
- Use dated bucket paths under `data/{teamId}/{yyyy}/{mm}/{dd}/` as the time boundary. Do not use file modification time. CRM team `-1` is stored as team `0`.

The lookback window is a separate view type, not the queue's memory. A 3-day or 30-day request answers what changed in that dated range. The `triage` view answers what is currently active in the accumulated snapshot for one as-of date.

## Current Supported Inputs

Daily triage reads deterministic accumulated-action snapshots as its primary state input:

- `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/accumulated-actions-{yyyy-mm-dd}.json`

Daily triage reads the generated actions report as its primary readable evidence layer:

- `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/actions-{yyyy-mm-dd}.md`

Use the JSON snapshot for counts, account/contact inclusion, same-day added/carried/removed state, and deterministic queue membership. Use the Markdown actions report for account/contact-level narrative, references, and the actions -> insight -> tensions -> memory chain. Do not make the brief or presentation files cite raw JSON paths as the main readable layer.

The accumulator script reads local dated summary artifacts:

- `data/{teamId}/{yyyy}/{mm}/{dd}/accounts/{id}/account-{id}-summary.md`
- `data/{teamId}/{yyyy}/{mm}/{dd}/contacts/{id}/contact-{id}-summary.md`

An account/contact is in scope for active `triage` only when the accumulated snapshot lists at least one active unresolved action for it. The actions report supplies the readable support for those included accounts and contacts. An account/contact is in scope for `lookback` when snapshots or source-backed dated artifacts show an action being added, changed, persisted, completed, superseded, or removed as no longer needed.

This is a storage-layout traversal, not a business-name lookup. Navigating the known dated folders to collect `*-summary.md` artifacts is allowed for this workflow.

If the accumulated snapshot or matching actions report is missing or older than the relevant local summary artifacts, run:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}
```

For a rebuild from `{start-date}`, the accumulator seeds from the latest existing accumulated snapshot before `{start-date}` and recalculates `{start-date}` forward. It starts blank only when no earlier base snapshot exists. Do not seed from the same-day snapshot when rebuilding that day, because same-day action additions and removals must be recalculated.

If the user asks for fresher data than the local summaries provide, refresh the relevant account/contact synthesis first with the normal source-generation and distillation workflow, rebuild accumulated actions, then rerun daily triage.

When the refresh distills multiple accounts and contacts, rebuild accumulated actions once after all requested accounts and contacts are distilled, not after each account/contact. Use the earliest action snapshot date changed during the batch as the rebuild `--from` date and the requested triage as-of date as `--to` when the briefing needs a later queue state.

Manual trigger phrases for accumulated-action calculation include `accumulated actions`, `rebuild action queue`, `refresh action queue`, `recalculate triage`, `build daily triage state`, `update accumulated queue`, `backfill action queue`, `as-of triage state`, and equivalent wording. These trigger the deterministic script only. They do not by themselves require a written brief, Marp files, or PDFs unless the user also asks for a triage briefing or deck.

## Run Steps

1. Set `view_type` to `triage` or `lookback` from the user's request.
2. Resolve the date scope:

- for `triage`, use the requested as-of date, defaulting to the current date
- for `lookback`, use the requested rolling or explicit date range

3. For `triage`, read `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/accumulated-actions-{yyyy-mm-dd}.json` for the as-of date.
4. For `triage`, read `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/actions-{yyyy-mm-dd}.md` for the same as-of date.
5. If the needed accumulated snapshot or actions report is missing or stale, run `node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}`. The default start date is `2025-01-01`.
6. For `lookback`, read accumulated snapshots and actions reports for the requested date range. If needed files are missing, run the same script across the lookback range from the configured queue start date through the lookback end date.
7. Use the accumulated snapshot fields as deterministic state:

- `active_actions`: the current active queue for the as-of date
- `changes_on_date.added`: actions newly added on that date
- `changes_on_date.carried`: actions still active after a same-day account/contact refresh
- `changes_on_date.removed`: actions removed on that date
- `removed-actions-{yyyy-mm-dd}.json`: separate removed-action file for that date when removals exist, including `removed_action_count` and `removed_actions` with `removal_reason`
- `actions-{yyyy-mm-dd}.md`: readable grouped account/contact support, ordered as actions -> insight -> tensions -> memory

Snapshot action rows expose account/contact identity, `action_text`, first/last seen dates, source date, and latest summary path. The normalized action key is internal matching state only and should not be emitted. Do not emit internal status fields; closed status should appear as removal rather than an active row state.

8. Treat removals as first-class facts. A removed action means the accumulator saw a source-backed transition: a checked action, a closed-status summary or source, a latest summary that no longer includes the action, or a same-account/contact dated summary with no supported actions.
9. Do not infer removals from silence. If no newer same-account/contact summary exists, the prior active action remains carried forward in the accumulated snapshot.

Removal reasons:

- `checked-or-completed`: the newer summary contains the same action checked off
- `closed-status`: the newer summary or source frontmatter is closed, completed, inactive, archived, or otherwise closed-style
- `no-supported-actions-in-summary`: a newer same-account/contact summary exists without `## Proposed Actions`
- `not-present-in-latest-action`: a newer same-account/contact summary has proposed actions, but the prior action text no longer appears as an open action

For `lookback`:

- summarize new, changed, persistent, completed, superseded, and no-longer-needed actions across the selected accumulated snapshots
- do not carry forward older queue items into the lookback output unless needed as context for persistence or change
- do not represent lookback results as today's standing queue

10. Rank the resulting accounts, contacts, and action states by attention priority using the scoring rules below. Use the accumulated snapshot to decide which accounts and contacts are eligible; use the actions report to understand the account/contact narrative and cite the supporting actions, insights, tensions, and memory.
11. Write the dated narrative brief to the view-specific path:

```text
my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-triage-since-{start-date}.md
my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-lookback-{x}days.md
my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-lookback-{yyyy-mm-dd}-to-{yyyy-mm-dd}.md
```

12. Use that written brief markdown as the source of truth for presentation generation. Do not use older or sibling Marp files as the starting point for new briefing files.
13. Always create three briefing Marp sources and matching PDF exports:

```text
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-executive-summary.marp.md
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-executive-summary.pdf
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-whats-new-today.marp.md
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-whats-new-today.pdf
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-full-references.marp.md
my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-{view-scope}-full-references.pdf
```

14. If `triage` has no unresolved supported actions, still create the brief with an explicit zero-current-queue summary rather than skipping the run.
15. If `lookback` has no matching action changes in the requested scope, still create the brief with an explicit zero-change summary rather than skipping the run.

## Attention Ranking Rules

Rank items by franchise consequence and immediacy, not raw artifact count.

Prioritize higher when accumulated snapshots or underlying summaries show:

- a named next step blocked on follow-up today
- a scheduled meeting, diligence request, or promised deliverable
- in-brand retention pressure at a Royal LePage brokerage
- ownership transition, merger, succession, or financing friction
- recruiting openness caused by competitor disruption or dissatisfaction
- brokerage-health stress, fee relief requests, or support failures
- a high-influence person, team, office, or market-level effect
- repeated appearance across multiple dated snapshots inside the selected scope
- unresolved carry-forward from earlier `triage` runs

Prioritize lower when summary actions are only:

- informational logging with no new action
- future event planning with no near-term dependency
- stale, ambiguous, or waiting-state outreach without a concrete next move

Exclude an account/contact from active `triage` when it has no active unresolved action in the accumulated snapshot. In `lookback`, include completed, superseded, or no-longer-needed actions only when the selected snapshots or underlying artifacts support that change.

## Required Brief Sections

Every daily triage brief should contain:

```md
## Scope

## View Type

## Method

## What's New On The As-Of Date

## Full Active Queue

## Queue Changes

## Watchlist

## Actions Reviewed

## Slide Outline

## Traceback References

## Coverage Limits
```

Brief writing rules:

- Name the linked account and contact when source evidence supports both.
- State whether the posture is retention, recruiting, ownership transition, competitive risk, or general relationship.
- Distinguish `confirmed`, `in progress`, `rumored`, and `stale/unclear` when possible.
- Give a plain-language `why now` for each ranked item.
- End each top item with the most concrete next move supported by evidence.
- In `triage` view, state the queue start date, as-of date, accumulated snapshot path, action report path, added actions, removed actions, carried actions, active action count, and active account or contact count.
- In `triage` view, always split the narrative into two explicit sections: `## What's New On The As-Of Date` and `## Full Active Queue`.
- In `## What's New On The As-Of Date`, summarize only same-day adds, removals, same-day carried refreshes, and materially changed same-day signals. If there were no same-day changes, say that directly.
- In `## Full Active Queue`, summarize the standing unresolved queue as of the selected date, including the highest-priority active accounts and contacts and any backlog concentration that changes the operating read.
- In `lookback` view, state the requested lookback range and summarize new, changed, persistent, completed, superseded, and no-longer-needed actions inside that range.
- Cite the accumulated snapshot for deterministic counts and same-day change state, and cite the actions report for readable account/contact support. Call out when no local accumulated snapshot, actions report, or summary exists for a business area the user may expect to see.
- Separate carry-forward items from new or materially changed items so the reader can tell queue state from scoped discoveries. In `triage`, this separation should be visible in the section structure, not only implied in prose.
- When an account/contact appears, summarize all supported action states for that account/contact rather than only one of them.
- Add `## Slide Outline` as a slide-by-slide map for the three output files in presentation order. For each slide, name the target file, slide title, message line, primary proof, business implication, and intended next move or decision boundary.
- Add `## Traceback References` as the written reference layer for the briefing. For `triage`, split this section into two explicit subsections: `### What's New On The As-Of Date` and `### Full Active Queue`.
- In `### What's New On The As-Of Date`, use the accumulated snapshot and removed-action file to summarize same-day added, carried, and removed action content. If there were zero same-day changes, say that directly.
- In `### Full Active Queue`, use the actions report to list readable account/contact and action support for the claims in the brief and three output files. Include the real content needed to understand the claim: account/contact identity, active action text, and the relevant insight, tension, or memory. Do not use a path-only inventory as the traceback.
- Keep the written brief readable, but do not collapse referenceability into generic statements such as `see source files above`. The traceback section should make it possible to trace each slide back to the relevant action-bearing accounts and contacts through the action report content.

## Required Presentation Files

Default daily triage to three Marp files with matching PDFs:

- Executive summary: a concise decision readout and action map.
- What's new today: same-day adds, carries, removals, and fresh signals.
- Full references: complete visible action traceback by account/contact.

The view-specific written brief is the required upstream input for all three files. Treat the brief as the current synthesized narrative and reference layer. Do not generate new Marp files by copying, extending, or remixing prior Marp files without first regenerating or rereading the matching written brief.

## General Top-Down Storyline Template

Use this sequence in order for the executive summary. It should move from conclusion, to proof, to action.

1. Title and scope
2. Headline conclusion: the single business takeaway for the selected view
3. Core tension: the contradiction or pressure that explains why the current queue or lookback matters now
4. Summary proof: the few counts, trends, or comparisons that make the conclusion credible
5. Segmentation: the major issue groups or pressure types so the problem does not read like one undifferentiated list
6. Localization: the named accounts, contacts, teams, offices, or business relationships where the issue is actually showing up
7. Priority logic: the decision model, tradeoffs, and rules used to decide what rises first
8. Deep dives: the highest-priority issue clusters, each explained as current fact -> operating pressure -> business judgment -> next move
9. Action map: the recommended next moves, owners, and intervention rules for the highest-priority accounts and contacts
10. Watchlist or decision boundaries: what remains uncertain, what is being monitored, and what would change the ranking

## Default Daily Triage Mapping

For the daily triage executive summary, map the general storyline to this default sequence unless the user explicitly asks for another narrative or visual structure, or provides their own outline:

1. Title and scope
2. What's new on the as-of date: same-day adds, removals, carries, or explicit no-change state
3. Full active queue: the standing unresolved queue and the few pressures that make it matter now
4. Shared decision-making model: the prioritization lens, decision boundaries, and evidence-backed logic used to sort what rises first
5. Account/contact-level actionable rules: the recommended next moves, owners, and intervention rules for the highest-priority accounts and contacts
6. Watchlist or decision boundaries when they materially affect confidence

When the executive summary needs more narrative depth, expand the default sequence without changing the top-down logic:

- insert a headline-conclusion slide before business tension
- insert a summary-proof slide after business tension
- insert segmentation or issue-cluster slides before the shared decision-making model
- insert account/contact deep-dive slides between the shared decision-making model and the action map

The what's-new-today file should isolate same-day added, carried, removed, or materially changed actions. It should include an explicit no-change statement when the selected as-of date has no same-day changes. Do not repeat the full active queue unless same-day carry-forward or removal context needs it.

The full-references file should be audit-oriented. For `triage`, include one visible reference slide per active account/contact from the actions report. For `lookback`, include every account/contact with an action add, change, persistence signal, completion, supersession, or removal in the selected range. Each account/contact slide should show `Actions`, `Insight`, `Tensions`, and `Memory` when those sections exist.

## Slide-Level Hierarchy

Do not treat a slide as a flat page of bullets. Each slide should have internal hierarchy so the reader can understand the point in top-down order.

Default hierarchy inside a slide:

1. Slide title: the topic or business relationship
2. Slide subtitle or message line: the takeaway, tension, or decision statement for that slide
3. Primary proof: the one to three facts, counts, or comparisons that support the message line
4. Business interpretation: what those facts mean for risk, priority, confidence, or next action
5. Action or implication: what the audience should do, decide, or monitor next

Use the title and subtitle together as the headline layer. The rest of the slide should support that headline rather than forcing the audience to infer the point from raw detail.

For account/contact deep-dive slides, use this internal hierarchy when possible:

1. Account/contact name and posture
2. Current fact pattern
3. Operating pressure
4. Business judgment
5. Recommended next move

For summary or dashboard slides, use this internal hierarchy when possible:

1. View type and scope label
2. Key message
3. Supporting metrics or counts
4. Why it matters now
5. Priority implication

Keep the executive summary concise. Daily triage is an executive scan; the full-references file carries the raw action traceback.

If the user wants to explore a different storyline, slide order, page density, layout system, or provides a custom outline, allow it. Preserve the same evidence boundary, business framing, action orientation, and three-file separation even when the presentation structure changes.

Presentation writing rules:

- Use business terms such as retention, recruiting opportunity, ownership transition, diligence, franchise health, and next move.
- Use the default storyline only when the user does not provide a custom structure. When the user does ask for another structure or supplies their own outline, adapt the storyline and layout to fit that request without dropping the business conclusion, evidence, prioritization logic, next moves, or three-file separation.
- For `triage`, preserve the distinction between `what's new on the as-of date` and the `full active queue`. The executive summary may reference both, the what's-new-today file isolates fresh changes, and the full-references file carries the complete active traceback.
- Make hierarchy visible within each slide through headings, subtitle lines, grouped proof, and a clear implication or next move. Do not rely on visual placement alone to carry the logic.
- Do not show technical field names or file paths in executive-summary or what's-new-today PDFs unless the user explicitly asks for technical detail.
- Translate technical data limits into business language such as `lookback limited to summaries with proposed actions in the selected dates`, `triage initialized from available summary actions since the queue start date`, or `confidence reduced because follow-up ownership is unclear`.
- Keep technical limitations in the written brief, not the executive-facing files, unless they directly change the business decision.
- Mirror the written brief's `## Slide Outline` in each Marp source. Each slide should have one hidden HTML comment block immediately after the slide content with these labels in order: `Outline`, `Message`, `Primary proof`, `Business implication`, and `References`.
- The `References` lines in those HTML comments should cite readable support from the actions report, such as account/contact names, active action text, insight, tension, or memory. They may include artifact paths only as secondary audit detail, not as the primary reference.
- When a slide summarizes multiple accounts and contacts or an issue cluster, group the references inside the comment block by account/contact cluster or business lane so the slide remains traceable without turning visible executive slides into file-path dumps.
- The executive summary should end with a short pointer to the full-references file and cite the highest-priority supporting accounts and contacts.
- The full-references file replaces the old end-of-deck references appendix. It is required for daily triage unless the user explicitly asks for no references.

## File Naming

For `triage` view:

- Written brief: `my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-triage-since-{start-date}.md`
- Executive summary: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-triage-since-{start-date}-executive-summary.marp.md` and `.pdf`
- What's new today: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-triage-since-{start-date}-whats-new-today.marp.md` and `.pdf`
- Full references: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-triage-since-{start-date}-full-references.marp.md` and `.pdf`

For rolling `lookback` view:

- Written brief: `my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-lookback-{x}days.md`
- Executive summary: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{x}days-executive-summary.marp.md` and `.pdf`
- What's new today: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{x}days-whats-new-today.marp.md` and `.pdf`
- Full references: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{x}days-full-references.marp.md` and `.pdf`

For explicit date-range `lookback` view:

- Written brief: `my-work/daily-triage/{yyyy}/{mm}/{dd}/daily-triage-brief-lookback-{start-date}-to-{end-date}.md`
- Executive summary: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{start-date}-to-{end-date}-executive-summary.marp.md` and `.pdf`
- What's new today: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{start-date}-to-{end-date}-whats-new-today.marp.md` and `.pdf`
- Full references: `my-work/output/{yyyy}/{mm}/{dd}/daily-triage-{yyyy-mm-dd}-lookback-{start-date}-to-{end-date}-full-references.marp.md` and `.pdf`

Use ISO dates in filenames, such as `2025-01-01`. For rolling lookbacks, use the normalized day count even when the user asked with another phrase. Example: `2 weeks` writes `lookback-14days`. The filename, brief scope text, output scope text, and selected view type must agree.

## Coverage Limits And Refresh Rules

Daily triage uses deterministic accumulated snapshots as its primary state boundary, with the matching action report Markdown as the primary readable evidence layer. The referenced in-place `summary.md` artifacts remain the underlying source for the accumulator and may be used for deeper audit, but daily triage brief and presentation references should use the actions report first. `triage` reports the active queue for one as-of date. `lookback` reports only the requested dated scope, with older material used only as context for persistence or change. Neither view infers urgency from raw notes, unsynthesized local exports, or file modification timestamps.

Do not include an account/contact in active `triage` when it has no active unresolved action in the accumulated snapshot. For `lookback`, do not include the account/contact unless the selected snapshots or underlying artifacts support an action add, change, persistence signal, completion, supersession, or removal.

When coverage is thin or obviously stale:

- say so directly in `## Coverage Limits`
- name the missing business area or account/contact class when known
- refresh the relevant account/contact synthesis first if the user wants the latest source-backed action view

Do not fabricate an action priority for an account or contact that has no accumulated-snapshot support in the selected view scope.

## Output Rules

- Do not expose raw file contents unless the user asks for them.
- Build the brief from accumulated-action snapshots plus the matching actions report. Use local `summary.md` artifacts only when the actions report is missing, stale, or insufficient for a deeper audit.
- Build all three Marp files from the current daily triage brief markdown for the same view type and scope. Do not use existing Marp files as the source for another run.
- Collect every supported proposed-action state from each included account/contact, and distinguish unresolved, completed, superseded, and no-longer-needed actions.
- Keep the written brief franchise-specific and action-oriented.
- Always generate the executive-summary, whats-new-today, and full-references Marp sources and matching PDF exports for the briefing run.
- In `triage`, the visible brief and presentation files should make the difference between `what's new on the as-of date` and the `full active queue` explicit, even when there were zero same-day changes.
- Unless the user explicitly requests no references, include the full-references file as the visible detailed reference layer in addition to hidden Marp traceback comments.
- If confidence is limited by missing or stale local summaries, say so directly inside the brief and presentation files.

## Validation Checks

Before calling a daily triage run validated, confirm:

- The selected `view_type` is stated in the brief.
- For `triage`, the queue start date, as-of date, accumulated snapshot path, added actions, removed actions, carried actions, active action count, and active account or contact count are stated.
- For `lookback`, the requested lookback, normalized day count or explicit date range, brief filename, three Marp filenames, and three PDF filenames all match.
- The selected accumulated snapshots come from `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/` and match the selected view scope.
- The selected actions report comes from `data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/` and matches the selected view scope.
- For `triage`, the accumulated snapshot was read for the requested as-of date, and carried actions are labeled as carried rather than new discoveries.
- For `triage`, the actions report was read for the requested as-of date and used for account/contact-level readable support.
- For `triage`, the brief and three presentation files preserve the distinction between `what's new on the as-of date` and `full active queue`, or the user explicitly asked for another merge behavior.
- Every account/contact included in active `triage` has at least one unresolved active action in the accumulated snapshot.
- No account/contact without an unresolved proposed action is included in active `triage`.
- Every account/contact included in `lookback` has an action add, change, persistence signal, completion, supersession, or removal supported by the selected range.
- Repeated accounts and contacts were deduplicated by newest snapshot, with older appearances treated only as persistence or recurrence context.
- The written brief exists at the expected view-specific path.
- The Marp files were generated from that written brief rather than from older Marp files.
- The executive-summary, whats-new-today, and full-references Marp sources and PDF exports all exist under `my-work/output/{yyyy}/{mm}/{dd}/` with the same view-specific scope marker.
- Unless the user explicitly requested no references, the full-references file traces the presentation claims back to readable account/contact and action content from the actions report, split into `what's new on the as-of date` and `full active queue` for `triage`.
- Coverage limits are stated without implying unseen accounts and contacts have no risk.
