# Accumulated Actions Process

## Purpose

Build deterministic daily action-queue snapshots from existing local `summary.md` artifacts.

This process answers:

- What actions were active as of a date?
- What actions were added on that date?
- What actions carried forward after an account/contact refresh?
- What actions were removed, and why?

Accumulated actions are deterministic state. They are not daily triage briefs, decks, CRM tasks, or CRM writes.

## Trigger Rules

Run accumulated-action calculation manually when the user asks for:

- `accumulated actions`
- `rebuild action queue`
- `refresh action queue`
- `recalculate triage`
- `build daily triage state`
- `update accumulated queue`
- `backfill action queue`
- `as-of triage state`

Equivalent wording should also trigger the calculation when the intent is to rebuild deterministic queue state.

Run accumulated-action calculation automatically once at the end of a distillation run when any requested account or contact creates, updates, checks, removes, or materially changes `## Proposed Actions` inside a dated `*-summary.md` artifact.

Do not rebuild after each account or contact inside a multi-account/contact distillation run. Record the affected action snapshot dates during the run, then rebuild once after all requested accounts and contacts are distilled.

## Command

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={start-date} --to={as-of-date}
```

For automatic post-distillation rebuilds:

- `{teamId}` should be the workspace team folder ID. CRM team `-1` is stored as `0`.
- `{start-date}` should be the earliest affected action snapshot date.
- `{as-of-date}` should be the latest affected action snapshot date or requested triage date, whichever is later.

For manual rebuilds, use the start date requested by the user.

## Base Snapshot Rule

When rebuilding from a date, the script seeds from the latest existing accumulated snapshot for that team before that date, then recalculates the requested date forward.

It starts blank only when no earlier base snapshot exists.

Do not use the same-day snapshot as the base when rebuilding from that day. Same-day additions and removals must be recalculated.

## Inputs

The script reads dated local summary artifacts:

```text
data/{teamId}/{yyyy}/{mm}/{dd}/accounts/{id}/account-{id}-summary.md
data/{teamId}/{yyyy}/{mm}/{dd}/contacts/{id}/contact-{id}-summary.md
```

The absence of `## Proposed Actions` in a same-account/contact dated `summary.md` is meaningful: it means that snapshot has no supported actions.

## Outputs

The script writes one JSON snapshot per day:

```text
data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/accumulated-actions-{yyyy-mm-dd}.json
data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/removed-actions-{yyyy-mm-dd}.json
```

The script also writes one Markdown actions report per day:

```text
data/{teamId}/daily-triage/{yyyy}/{mm}/{dd}/actions-{yyyy-mm-dd}.md
```

The actions report lists the active queue grouped by account or contact, with readable content in this order: active actions, insight, tensions, memory. It is meant for operator review and briefing references so daily triage can cite the real judgment content instead of JSON paths.

Top-level fields include:

- `generated_at`
- `start_date`
- `as_of_date`
- `base_snapshot`
- `source_summary_files`
- `active_action_count`
- `active_object_count`
- `active_actions`
- `changes_on_date`

## Action Row Shape

Rows in `active_actions`, `changes_on_date.added`, and `changes_on_date.carried` should expose only useful business and traceback fields:

```json
{
  "object_type": "account",
  "object_id": "123",
  "team_id": "0",
  "action_text": "Action text",
  "first_seen_date": "2025-01-01",
  "last_seen_date": "2026-01-03",
  "latest_summary_path": "data/0/2026/01/03/accounts/123/account-123-summary.md",
  "source_date": "2026-01-03"
}
```

Do not emit:

- `action_key`
- stale summary paths unrelated to the current active action
- `status`

`action_key` is internal matching state only. It is usually normalized `action_text`, so emitting both is redundant.

Closed status is not an active state. It should remove the action.

## Removal Logic

Removal must be explicit. Do not remove an action because no newer artifact exists.

An action is removed only when the accumulator sees one of these source-backed transitions:

- `checked-or-completed`: a newer summary contains the same action checked off.
- `closed-status`: a newer summary has closed-style frontmatter such as `closed`, `complete`, `completed`, `inactive`, or `archived`.
- `no-supported-actions-in-summary`: a newer same-account/contact summary exists without `## Proposed Actions`.
- `not-present-in-latest-action`: a newer same-account/contact summary has proposed actions, but the prior action text no longer appears as an open action.

Rows in `changes_on_date.removed` should include the prior action fields plus:

```json
{
  "removed_date": "2026-01-03",
  "removal_reason": "not-present-in-latest-action"
}
```

The same removed rows must also be written to the separate removed-actions file for that day:

```json
{
  "generated_at": "2026-01-03T00:00:00.000Z",
  "start_date": "2025-01-01",
  "as_of_date": "2026-01-03",
  "base_snapshot": "data/0/daily-triage/2026/01/02/accumulated-actions-2026-01-02.json",
  "removed_action_count": 1,
  "removed_actions": [
    {
      "object_type": "account",
      "object_id": "123",
      "team_id": "0",
      "action_text": "Action text",
      "first_seen_date": "2025-01-01",
      "last_seen_date": "2026-01-02",
      "latest_summary_path": "data/0/2026/01/03/accounts/123/account-123-summary.md",
      "source_date": "2026-01-02",
      "removed_date": "2026-01-03",
      "removal_reason": "not-present-in-latest-action"
    }
  ]
}
```

Write the removed-actions file only when at least one action was removed that day. If no actions were removed, do not create `removed-actions-{yyyy-mm-dd}.json`; if a stale zero-removal file already exists for that date, the accumulator should delete it.

## Relationship To Daily Triage

Daily triage does not calculate the queue itself. It reads the accumulated snapshot for the requested as-of date, then produces the written brief, three Marp files, and matching PDFs.

Lookback views may read multiple accumulated snapshots to explain what changed over a period. Lookback is not the standing queue.
