# Insight Process

## Purpose

Guide the `## Insight` section inside `summary.md`, grounded in evidence, memory, and tension.

Insight answers: what does this mean now, and why should the user care?

Insight is more temporary than memory. It is a current interpretation for decision support.

## Inputs

Allowed inputs:

- Freshly created or refreshed `source.md` from the same run
- Drafted or current `## Memory` section content
- Drafted or current `## Tensions` section content
- Existing in-place `*-summary.md` for the same snapshot when refreshing or older dated summaries for continuity checks

## Creation Rules

- Start from evidence, then memory, then tension.
- Explain why the situation matters now.
- Make the business consequence visible.
- Separate confidence from certainty.
- Do not present an insight as a fact.
- Do not create insight when the evidence does not support a meaningful judgment.
- Connect the insight to a franchise outcome: recruiting, retention, renewal, brokerage health, ownership stability, territory position, service value, or competitive risk.
- Do not stop at "what happened"; state what decision or business attention the franchise team should consider.

Good insight usually connects:

- what happened
- what seems durable
- what is under pressure
- what decision or attention is needed now
- what franchise outcome is at stake

## Output Format

Use this structure inside `summary.md`:

```md
## Insight

- ...

## Reasoning

- ...

## Business Consequence

- ...

## Franchise Impact

- Lens: recruiting/affiliation | retention/renewal | brokerage health | ownership/succession | territory dynamics | relationship influence | service value | compliance/legal dependency | competitive risk | growth opportunity
- Impact: ...

## Confidence

High | Medium | Low
```

## Quality Bar

Good insight is specific, timely, grounded, and useful for franchise action.

Bad insight is a broad summary, a restated tension, a prediction without evidence, or a recommendation disguised as fact.

## TTL

TTL is controlled by `process/summary.md`.

## Do Not Create Insight When

- The evidence is too thin to support judgment.
- The situation is already fully explained by the evidence layer.
- The output would be generic advice that could apply to any account or contact.
- The output does not change franchise decision-making.
