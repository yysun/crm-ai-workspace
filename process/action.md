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
- Each checkbox must represent exactly one operational job with one owner path and one completion state. Split compound work into separate checkboxes when a sentence asks the operator to confirm one fact and assess a separate risk, unless the two questions are inseparable in the same owner conversation.
- Prefix each action with an action type: `retain`, `recruit`, `escalate`, `clarify`, `support`, `monitor`, `source correction`, `legal/commercial review`, or `relationship owner review`.
- Match action posture to team objective before brokerage brand:
  - Team `0`: use `retain`, `support`, `escalate`, `monitor`, `clarify`, or `legal/commercial review` for retention and brokerage-health work; use commercial-program actions only when contact evidence supports them.
  - Team `6`: use `recruit`, `clarify`, `monitor`, or `relationship owner review` for prospecting and access-path work.
  - Team `7`: use `clarify`, `support`, `monitor`, or `relationship owner review` for commercial-program qualification, eligibility, and contact access; do not default to retention or prospecting actions.
- If team objective is unavailable, match action posture to brokerage brand by default: Royal LePage brokerages should skew toward `retain`, `support`, `escalate`, or `monitor`; non Royal LePage brokerages should skew toward `recruit`, `clarify`, `monitor`, or `relationship owner review`.
- If the user request or source evidence is about a contact- or agent-level commercial program, actions may target eligible contacts in either Royal LePage or non Royal LePage brokerages without changing the brokerage-level posture.
- Every action must state the franchise business purpose, not just the activity.
- Keep the checkbox's first sentence short enough to become `ActionTitle` after the action-type prefix is removed. Put supporting detail in nested `Purpose`, `Rationale`, or `Preconditions` bullets instead of appending a `Purpose:` clause to the checkbox sentence.
- Do not use category punctuation as a fake title. The backticked prefix is the normalized category/lane; the action sentence is the work instruction; downstream publishing derives `ActionTitle` from the action sentence.

## Output Format

Use this structure inside `summary.md`. Do not create `action.md`. Do not add action metadata as additional top-level summary sections such as `## Rationale`, `## Preconditions`, `## Franchise Purpose`, or `## Not Tasks Yet`.

```md
## Proposed Actions

- [ ] `clarify`: Short action instruction.
  - Purpose: ...
  - Rationale: ...
  - Preconditions: ...
  - Local state: Proposed recommendation only; no external task or CRM write exists unless a selected gated publishing process runs.
- [ ] `retain`: ...
  - Purpose: ...
  - Rationale: ...
  - Preconditions: ...
- [x] `source correction`: ...
  - Purpose: ...
  - Rationale: ...
  - Local state: Checked means the local recommendation was handled or dismissed locally; it does not update any external system.
```

Use nested metadata only when it adds useful business clarity. Omit empty `Rationale`, `Preconditions`, or `Local state` lines rather than writing placeholders.

## Quality Bar

Good action is specific, justified, tied to the current situation, and connected to a franchise outcome.

Bad action is generic, overreaching, disconnected from evidence, or silently turns a recommendation into assigned work.

Bad action is also compound: `Confirm X and assess Y` creates ambiguous ownership and completion semantics when X and Y can be completed independently.

## TTL

TTL is controlled by `process/summary.md`.

When `summary.md` is refreshed, keep supported actions in `## Proposed Actions`. If no supported actions remain after distillation, omit the section. If the current source evidence shows that the account or contact is inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up, exclude the object from normal distillation instead of authoring actions. Closed source snapshots remove prior open actions through the accumulated-action rebuild.

## Do Not Create Action When

- There is no clear insight or tension driving it.
- The action would require facts not present in the source evidence.
- The recommendation is generic account-management advice.
- The user asked only for facts and not for next moves.
- The action does not support recruiting, retention, brokerage health, ownership stability, territory position, service value, compliance, competitive risk, or growth.
- There is no supported action in the current distillation result.
- The account or contact is inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up.

## Accumulated Queue Rule

After `## Proposed Actions` is created, updated, checked, removed, or materially changed inside `summary.md`, mark that snapshot date for deterministic accumulated-action rebuild. If an account/contact is excluded because its source became inactive or closed, mark that source snapshot date for accumulated-action rebuild. If multiple objects are being distilled in one run, do not rebuild after each object. Rebuild once after all requested objects are complete:

```text
node scripts/build-accumulated-actions.js --team={teamId} --from={earliest-affected-date} --to={latest-required-date}
```

Use the team ID from the summary path as `{teamId}`; CRM team `-1` is stored as `0`. Use the earliest affected summary snapshot date as `{earliest-affected-date}`. The script seeds from the latest accumulated snapshot before that date in the same team. Use `2025-01-01` only when no earlier base snapshot exists or when the user explicitly requested a full rebuild from that date. This script rebuild is deterministic state maintenance; it does not create the daily triage brief, Marp files, or PDFs.

When rebuilding from a date, the script seeds from the latest accumulated snapshot before that date and recalculates that date forward. It starts blank only when no earlier base snapshot exists.
