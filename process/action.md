# Action Process

## Purpose

Guide the `## Proposed Actions` section inside `summary.md` for an account or contact.

Action answers: what should be considered next, and what full current judgment supports those next moves?

An action is not a task. A task is a commitment with an owner, deadline, and status. Do not represent proposed actions as tasks unless a real task exists in the source evidence or the user explicitly asks for a local task artifact.

## Inputs

Allowed inputs:

- Freshly created or refreshed `source.md` from the same run
- Drafted or current `## Memory` section content
- Drafted or current `## Tensions` section content
- Drafted or current `## Insight` section content
- Existing in-place `*-summary.md` for the same snapshot or older dated snapshots for the same object

## Creation Rules

- Recommend actions only when they follow from the evidence and insight.
- Keep actions concrete enough for a human to evaluate.
- Do not assign owners, deadlines, or statuses unless the user provided them or they already exist in the source evidence.
- Do not present proposed actions as CRM notes, tasks, or other external records.
- Prefer a small number of high-leverage actions over a long generic list.
- Track proposed actions as Markdown checkboxes so a human or future agent can check them off locally.
- Checking off a local action does not mean an external task exists, an external task is complete, or any external write occurred.
- Prefix each action with an action type: `retain`, `recruit`, `escalate`, `clarify`, `support`, `monitor`, `source correction`, `legal/commercial review`, or `relationship owner review`.
- Match action posture to team objective before brokerage brand:
  - Team `0`: use `retain`, `support`, `escalate`, `monitor`, `clarify`, or `legal/commercial review` for retention and brokerage-health work; use commercial-program actions only when contact evidence supports them.
  - Team `6`: use `recruit`, `clarify`, `monitor`, or `relationship owner review` for prospecting and access-path work.
  - Team `7`: use `clarify`, `support`, `monitor`, or `relationship owner review` for commercial-program qualification, eligibility, and contact access; do not default to retention or prospecting actions.
- If team objective is unavailable, match action posture to brokerage brand by default: Royal LePage brokerages should skew toward `retain`, `support`, `escalate`, or `monitor`; non Royal LePage brokerages should skew toward `recruit`, `clarify`, `monitor`, or `relationship owner review`.
- If the user request or source evidence is about a contact- or agent-level commercial program, actions may target eligible contacts in either Royal LePage or non Royal LePage brokerages without changing the brokerage-level posture.
- Every action must state the franchise business purpose, not just the activity.

## Output Format

Use this structure inside `summary.md`. Do not create `action.md`.

```md
## Proposed Actions

- [ ] `clarify`: ... Purpose: ...
- [ ] `retain`: ... Purpose: ...
- [x] `source correction`: ... Purpose: ...

## Rationale

- ...

## Preconditions

- ...

## Franchise Purpose

- ...

## Not Tasks Yet

- These are local recommendations only.
- A checked box means the local recommendation was handled or dismissed locally; it does not update any external system.
```

## Quality Bar

Good action is specific, justified, tied to the current situation, and connected to a franchise outcome.

Bad action is generic, overreaching, disconnected from evidence, or silently turns a recommendation into assigned work.

## TTL

TTL is controlled by `process/summary.md`.

When `summary.md` is refreshed, keep supported actions in `## Proposed Actions`. If no supported actions remain after distillation, omit the section.

## Do Not Create Action When

- There is no clear insight or tension driving it.
- The action would require facts not present in the source evidence.
- The recommendation is generic account-management advice.
- The user asked only for facts and not for next moves.
- The action does not support recruiting, retention, brokerage health, ownership stability, territory position, service value, compliance, competitive risk, or growth.
- There is no supported action in the current distillation result.

## Accumulated Queue Rule

After `## Proposed Actions` is created, updated, checked, removed, or materially changed inside `summary.md`, mark that snapshot date for deterministic accumulated-action rebuild. If multiple objects are being distilled in one run, do not rebuild after each object. Rebuild once after all requested objects are complete:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={earliest-affected-date} --to={latest-required-date}
```

Use the team ID from the summary path as `{teamId}`; CRM team `-1` is stored as `0`. Use the earliest affected summary snapshot date as `{earliest-affected-date}`. The script seeds from the latest accumulated snapshot before that date in the same team. Use `2025-01-01` only when no earlier base snapshot exists or when the user explicitly requested a full rebuild from that date. This script rebuild is deterministic state maintenance; it does not create the daily triage brief, Marp files, or PDFs.

When rebuilding from a date, the script seeds from the latest accumulated snapshot before that date and recalculates that date forward. It starts blank only when no earlier base snapshot exists.
