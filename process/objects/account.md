# Account Object Contract

## Object Boundary

The account object answers: what durable franchise-business truth should be remembered about this brokerage, owner group, or franchise relationship, and does the current posture point to retention or prospecting?

For account memory extraction:

- Apply the team objective first. Team `0` accounts are retention-first, team `6` accounts are prospecting-first, and team `7` accounts are commercial-program-context accounts whose value is the path to eligible contacts or commercial-program adoption.
- Royal LePage accounts default to retention, renewal strength, service value, and brokerage health.
- Confirmed non Royal LePage accounts default to prospecting, recruiting upside, and competitive entry paths. A generated `no Royal LePage marker detected` source label is only a confirmation prompt, not proof of that posture by itself.
- Team `7` overrides the generic retention/prospecting default: do not treat a team `7` account as a normal retention or prospecting account unless the source independently supports that scenario. Its primary distillation question is which commercial contacts, roles, offices, or needs the account exposes.
- Ownership, renewal, service friction, and competitor pressure can override the default emphasis only when the source evidence is explicit.

## Stable ID Source

- Prefer the CRM account primary key used by the dated storage layout.
- If the business system does not expose a stable account ID, do not create `data/{teamId}/{yyyy}/{mm}/{dd}/accounts/{id}/` artifacts for the object.

## Rule Table

| Situation Type | Key Input Fields | Minimum Trigger Threshold | Tension | Judgment Direction | Suggested Action | Prohibited Misuse |
| --- | --- | --- | --- | --- | --- | --- |
| Royal LePage retention pressure | brokerage brand, owner or decision-maker, renewal timing, service issues, competitor mentions, agent-count or office-health signals | The source shows the account is Royal LePage and contains either owner concern, unresolved service friction, renewal timing pressure, or competitor references | In-brand relationship value is under pressure while the account still matters for retention | Store memory around renewal posture, owner confidence, and the operating pattern driving churn risk | Preserve the durable retention fact pattern and route follow-up into renewal or relationship-stabilization work | Do not treat a Royal LePage brokerage as a prospecting target just because it has problems |
| Royal LePage stable growth platform | brokerage brand, leadership stability, recruiting/growth notes, service adoption, positive owner sentiment | Repeated evidence shows stable leadership, constructive sentiment, or growth-oriented collaboration inside Royal LePage | Strong in-brand footing may create expansion or champion value | Store memory around trust, growth appetite, influence, and where the brand is delivering value | Flag the account as a retention-strength and growth-support relationship | Do not turn one positive note into a brokerage-wide strength claim without repeated support |
| Non Royal LePage prospecting fit | brokerage brand, recruiting notes, owner openness, competitor posture, market footprint, switching or affiliation signals | The source shows the account is not Royal LePage and includes evidence of openness, dissatisfaction, recruiting movement, or competitive vulnerability | Out-of-brand opportunity exists but the conversion path may still be unclear | Store memory around prospecting posture, access path, and why the account could be recruitable | Preserve the durable entry point, influence map, and business reason to pursue | Do not frame a non Royal LePage brokerage as a retention account unless the user explicitly asked for competitor monitoring only |
| Commercial-program account context | team ID, commercial-program posture, linked contacts, role or production clues, stated commercial needs, account access path | The source is in team `7` or explicitly shows commercial-program targeting at the account/contact level | The account may matter less as a franchise target than as a route to commercial-program contacts or adoption | Store memory around access path, eligible contacts, commercial need, and what remains unknown about fit | Route follow-up toward contact qualification, program eligibility, and relationship path | Do not reclassify the account as ordinary retention or prospecting when the team objective is commercial-program targeting |
| Ownership or leadership transition | current owner, incoming owner, operator changes, succession stage, APA/IBA dependencies, office impact | The source shows a sale, succession, leadership turnover, or approval-gated transition affecting the account | Relationship continuity may hinge on who controls the next decision | Store memory around control changes, approval dependencies, continuity risk, and affected business scope | Route the account toward ownership-transition analysis and continuity planning | Do not infer a completed transfer, approval, or final owner intent when the source only shows early-stage discussion |
| Competitive or service-value exposure | competitor identity, service complaints, finance/legal blockers, support issues, territory pressure | Repeated evidence ties a named issue or competitor to the account's willingness to stay, grow, or engage | Value delivery is being tested against alternatives or internal friction | Store memory around the recurring blocker and the business consequence if it persists | Preserve the durable exposure so future summaries do not treat it as a one-off note | Do not escalate a single complaint into a strategic threat without evidence of recurrence or consequence |

## Judgment Boundary

- The account object is about brokerage-level or franchise-relationship truth, not a generic note digest.
- Team objective is the first routing decision; brand posture is second. Team `0` means retention-first, team `6` means prospecting-first, and team `7` means commercial-program-context-first.
- Do not let a contact-level commercial program opportunity reclassify the brokerage itself.
- Do not generalize from one agent, one office, or one anecdote into brokerage-wide health unless the source supports a broader pattern.
- When renewal, ownership transition, recruiting, or competitive risk clearly dominates, keep the memory aligned with that scenario instead of inventing a blended account story.
- If owner identity, brand posture, or relationship state is unclear, record the ambiguity rather than forcing a retention or prospecting label.

## Action Boundary

- Prefer memory that supports future franchise decisions: retain, recruit, stabilize, clarify ownership, or defend against competitors.
- Suggest only local planning actions such as clarification, escalation, or relationship follow-up; this layer does not perform CRM writes or external commitments.
- Keep actions tied to the account-level business mechanism, not generic account management language.
- If the evidence only supports a short-lived event, keep it out of memory and leave it in tensions or proposed actions instead.
