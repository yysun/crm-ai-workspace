# Memory Process

## Purpose

Guide the `## Memory` section inside `summary.md` for an account or contact.

When the object type is known, apply the matching object contract in `process/objects/account.md` or `process/objects/contact.md` as an additional extraction filter.

Memory answers: what is becoming true about this object that should influence future decisions?

Memory is not a note summary. It is reusable franchise-business understanding distilled from evidence.

## Inputs

Allowed inputs:

- freshly created or refreshed `source.md` from the same run
- Existing in-place `*-summary.md` for the same snapshot when refreshing
- Existing older dated `*-summary.md` snapshots for the same object

Do not use chat history as source evidence unless it matches the generated source layer or the user explicitly provided it for this run.

## Creation Rules

- Create memory only when the pattern is durable enough to matter beyond the current conversation.
- Prefer repeated evidence, stable profile data, or strong explicit statements.
- A single note can support memory only when it is direct, material, and not contradicted elsewhere.
- Every memory statement must be traceable to the active source layer for the same object and run.
- Record the evidence origin, the business object it belongs to, the time window covered by that evidence, and the current missing facts that still limit confidence.
- Do not convert every recent event into memory.
- Do not merge temporary recommendations into memory.
- Do not store guesses about intent, relationship quality, or risk as memory without evidence.
- When current source evidence shows that an account or contact has become inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up, exclude it from normal summary authorship. Do not write a new memory section only to record inactivity unless the user explicitly asks for an exception.
- Do not invent object IDs, relationship linkage, or time windows that are not visible in the current source layer.
- Always identify why the memory matters to real estate franchising.
- Use franchise lenses: recruiting/affiliation, retention/renewal, brokerage health, ownership/succession, territory dynamics, relationship influence, service value, compliance/legal dependency, competitive risk, growth opportunity.
- If the source evidence is revised or later found incomplete, refresh or downgrade the dependent memory rather than carrying forward stale certainty.

## Output Format

Use this structure inside `summary.md`:

```md
## Memory

- ...

## Evidence

- Source files: ...
- Object: ...
- Coverage window: ...
- Missing or unresolved: ...

## Franchise Relevance

- Lens: recruiting/affiliation | retention/renewal | brokerage health | ownership/succession | territory dynamics | relationship influence | service value | compliance/legal dependency | competitive risk | growth opportunity
- Why it matters: ...

## Confidence

High | Medium | Low

## Review Notes

- ...
```

## Quality Bar

Good memory is stable, concise, evidence-backed, and relevant to franchise growth, retention, recruiting, brokerage stability, or competitive position.

Bad memory is a restated note, a vague summary, a temporary recommendation, an unsupported judgment, or an untraceable carry-forward from older layers.

## TTL

TTL is controlled by `process/summary.md`.

## Do Not Create Memory When

- The data only shows a one-time event.
- The evidence is ambiguous or contradictory.
- The content belongs in the `## Tensions`, `## Insight`, or `## Proposed Actions` sections of `summary.md`.
- The agent would need to invent business meaning to make it useful.
- The memory cannot be tied to a real source file, a real object, and a clear time window.
