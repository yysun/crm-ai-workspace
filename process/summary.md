# Summary Process

## Purpose

Create the combined judgment layer for an account or contact.

`summary.md` is the only combined judgment file for a dated snapshot. In dated buckets it is stored as an in-place sibling such as `account-{id}-summary.md` or `contact-{id}-summary.md`. When actions are supported, keep them in `## Proposed Actions` inside the summary.

Summary answers: what seems durable, what is under pressure, what it means now, and what should be considered next?

## Inputs

Allowed inputs:

- freshly created or refreshed `source.md` from the same run
- existing in-place `*-summary.md` for the same snapshot when refreshing
- existing older dated `*-summary.md` snapshots for the same object
- scenario process files such as `process/renewal.md`, `process/ownership-transition.md`, `process/recruiting.md`, and `process/competitive-risk.md`
- `process/memory.md`, `process/tension.md`, `process/insight.md`, and `process/action.md` as section-level guidance for composing summary sections

Do not use chat history as source evidence unless it matches the generated source layer or the user explicitly provided it for the run.

## Creation Rules

- Create or refresh `summary.md` only after `source.md` is current for the same run.
- Use a staged distillation flow: detect `Tensions`, then form `Insight`, then derive `Proposed Actions`.
- Include `Tensions`, `Insight`, and `Proposed Actions` only when they are supported by current evidence.
- Every statement must be grounded in the current generated `source.md`.
- Every downstream statement must remain traceable to a real source file, a real business object, and a clear coverage window from the same run.
- Do not create empty sections. If no tension is supported, omit `## Tensions`. If no insight is supported, omit `## Insight`. If no action is supported, omit `## Proposed Actions`.
- Keep durable patterns in `Memory`, active contradictions or pressure in `Tensions`, current business judgment in `Insight`, and next-move recommendations in `Proposed Actions`.
- Keep proposed actions as local recommendations only. Do not present them as CRM tasks, notes, or writes.
- Preserve checkbox state when refreshing the `Proposed Actions` section.
- If current source evidence shows that the account or contact is inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up, the object should normally be excluded before `summary.md` is authored. Do not create an inactive summary as a substitute for exclusion unless the user explicitly requested an exception.
- Keep the summary franchise-specific: retention, recruiting, ownership transition, brokerage health, territory dynamics, service value, compliance, and competitive risk.
- Apply the team objective before generic brand posture:
  - Team `0`: retention-first for Royal LePage accounts and contacts; add contact commercial-program opportunity only when supported.
  - Team `6`: prospecting-first for non-Royal-LePage accounts and contacts.
  - Team `7`: contact-commercial-program-first for accounts and contacts; account context should support contact access, eligibility, and program fit rather than defaulting to brokerage retention or prospecting.
- Prefer a short, high-signal summary over exhaustive restatement of the source layer.
- If source evidence changes or is later found incomplete, refresh, narrow, or downgrade downstream memory, tension, insight, and action rather than carrying forward unsupported certainty.

## Output Format

Use this structure after the required frontmatter. `## Memory`, `## Evidence`, `## Confidence`, and `## Review Notes` are always present. Add `## Tensions`, `## Insight`, and `## Proposed Actions` only when supported by the distillation flow. Do not add other top-level `##` sections to `summary.md`; action rationale, preconditions, purpose, and local-state notes belong as nested bullets under the relevant checkbox in `## Proposed Actions`.

```md
## Memory

- ...

## Evidence

- Source files: ...
- Object: ...
- Coverage window: ...
- Missing or unresolved: ...

## Tensions

- Lens: ...
- Tension: ...
- Why it matters: ...

## Insight

- ...

## Proposed Actions

- [ ] `clarify`: ... Purpose: ...
- [ ] `retain`: ... Purpose: ...

## Confidence

High | Medium | Low

## Review Notes

- ...
```

The frontmatter must include `team_id` copied from the matching source layer. CRM team `-1` is stored as `0`.

When there is no supported tension, insight, or action, omit that section entirely instead of inserting a placeholder heading.

## Section Rules

### Memory

- Include only durable, reusable franchise-business understanding.
- Do not restate every recent event.
- Prefer stable profile facts, repeated evidence, or direct material statements.
- Record where the memory came from, which object it belongs to, what period it covers, and what still remains unresolved.

### Tensions

- Surface active contradiction, pressure, risk, or opportunity.
- Distinguish risk from opportunity.
- Explain the business mechanism when it matters.
- Omit this section when no tension is supported by current evidence.

### Insight

- State what the current evidence means now.
- Make the business consequence visible.
- Do not present interpretation as fact.
- Omit this section when current evidence does not support a material insight.

### Proposed Actions

- Keep actions concrete enough for a human to evaluate.
- Use Markdown checkboxes.
- Prefix each action with an action type such as `retain`, `recruit`, `clarify`, `monitor`, `support`, `escalate`, `source correction`, `legal/commercial review`, or `relationship owner review`.
- A checked box is local status only; it does not imply any external write occurred.
- Omit this section when no action is supported by current evidence.
- Do not create a standalone `action.md`; the accumulator reads this section from `summary.md`.

## Quality Bar

Good summary is evidence-backed, franchise-relevant, concise, and actionable.

Bad summary is a note dump, a generic recap, or a mix of unsupported judgment and silent task assignment.

## TTL

Default TTL: `P3D`.

Use a shorter TTL when the summary depends on a near-term event, deadline, meeting, or unresolved recommendation.

## Validation Checks

Before calling `summary.md` valid, confirm:

- A current `source.md` from the same run exists and is referenced in frontmatter.
- Frontmatter includes `created_at`, `updated_at`, `ttl`, `expires_at`, `status`, `source_date`, and `source_files`.
- Required sections are present: `Memory`, `Evidence`, `Confidence`, and `Review Notes`.
- The `Evidence` section records source origin, business object, coverage window, and current missing or unresolved facts.
- `Tensions` is present only when supported by current evidence.
- `Insight` is present only when supported by current evidence.
- `Proposed Actions` is present only when supported actions exist.
- Inactive or closed accounts and contacts are excluded from normal summary authorship and active triage scope.
- Every material judgment is grounded in the same-run `source.md`.
- Every material judgment remains traceable to a real source file, a real object, and a clear time window.
- Proposed actions use Markdown checkboxes and remain local recommendations.
- No action metadata appears as top-level sections such as `Rationale`, `Preconditions`, `Franchise Purpose`, or `Not Tasks Yet`.
- Existing checkbox state was preserved when refreshing the `Proposed Actions` section while supported actions remained.
- No `action.md` was created during distillation.
- The `expires_at` value matches the TTL and should be treated as historical once expired.

## Do Not Put In Summary

- raw field dumps that belong in `source.md`
- unsupported judgment or predictions
- external writes presented as already completed
- implied certainty when the evidence is ambiguous or stale
