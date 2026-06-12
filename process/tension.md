# Tension Process

## Purpose

Guide the `## Tensions` section inside `summary.md` for an account or contact.

Tension answers: where is something misaligned, unresolved, risky, or opening up?

## Inputs

Allowed inputs:

- Existing in-place `*-summary.md` for the same snapshot when refreshing
- Freshly created `source.md` from the same run
- Any drafted `## Memory` section content for the same `summary.md`

## Creation Rules

- Look for contradictions between fields, notes, timing, relationship signals, and business goals.
- Name the pressure clearly.
- Distinguish risk from opportunity.
- Prefer tensions that imply a decision or follow-up.
- Do not treat ordinary activity as tension.
- Do not inflate weak signals into major risk.
- Classify every tension by franchise lens: recruiting/affiliation, retention/renewal, brokerage health, ownership/succession, territory dynamics, relationship influence, service value, compliance/legal dependency, competitive risk, growth opportunity.
- Explain the business mechanism: how this tension could affect franchise value, agent count, owner confidence, territory position, renewal health, or competitive exposure.

Examples of valid tensions:

- Strong brokerage profile but no recent retention follow-up.
- Agent or team movement without clear owner response.
- Ownership transition with unresolved APA, IBA, succession, or territory dependency.
- Competitor affiliation signal inside an account with existing retention stress.
- Multiple notes about the same franchise issue without evidence of closure.

## Output Format

Use this structure inside `summary.md`:

```md
## Tensions

- Lens: ...
- Tension: ...

## Supporting Evidence

- ...

## Severity

High | Medium | Low

## Why It Matters

- ...

## Business Mechanism

- ...
```

## Quality Bar

Good tension makes the franchise-business pressure visible.

Bad tension is a generic concern, a raw fact, or an unsupported escalation.

## TTL

TTL is controlled by `process/summary.md`.

## Do Not Create Tension When

- There is no clear contradiction, pressure, risk, or opportunity.
- The only evidence is stale and not supported by the current generated source layer.
- The output would simply repeat facts already covered in `source.md`.
- The account or contact is inactive, closed, archived, completed, terminated, or otherwise no longer active for franchise follow-up.
