# Recruiting Workflow

## Purpose

Assess recruiting opportunity, attrition risk, team movement, and affiliation change in franchise terms rather than generic contact management terms.

Use this workflow when the evidence suggests a move into or out of the brand, a team migration, or a contact signal that could affect brokerage growth or retention.

Brand posture baseline:

- Team objective comes first. Team `0` is retention-first, team `6` is prospecting-first, and team `7` is contact-commercial-program-first.
- Royal LePage brokerages are in-brand and should default to retention framing.
- Royal LePage agents inside those brokerages should default to agent-retention framing.
- Non Royal LePage brokerages are out-of-brand and should default to prospecting framing.
- A contact- or agent-level commercial program can target people inside both Royal LePage and non Royal LePage brokerages.
- Commercial-program eligibility does not change whether the brokerage itself is a retention relationship or a prospecting target.
- Commercial-program eligibility for a Royal LePage agent adds a second lens; it does not replace agent retention.
- Override that baseline only when current source evidence and the user request clearly point to a narrower issue such as data correction or competitive monitoring.

## When To Use

Use this workflow when any of these appear in the user request or source evidence:

- future affiliation, brand move, team movement, recruiting conversation, or agent departure
- questions about whether someone is recruitable, retainable, or already lost
- competitor outreach or inbound interest involving an agent, team, owner, or office
- account notes about attrition, incoming talent, or targeted recruiting effort
- contact records that imply movement but lack narrative context

## Required Evidence Checklist

Gather or mark unknown:

- person, team, or account affected
- source brand or brokerage and target brand or brokerage if present
- whether the brokerage is Royal LePage or non Royal LePage
- default franchise posture: `retention` for Royal LePage or `prospecting` for non Royal LePage
- whether the person is a Royal LePage agent who defaults to agent retention
- whether the analysis is about brokerage posture or a contact/agent commercial program
- whether the contact or agent is an eligible commercial-program target
- influence level: agent, team leader, owner, operator, office, or market influencer
- movement stage: `confirmed`, `in progress`, `rumored`, or `stale/unclear`
- scope: `isolated`, `team`, `brokerage`, or `market`
- relationship owner sensitivity or account sensitivity if present in notes
- business consequence: headcount, production influence, owner confidence, cultural ripple, or market signal

Do not infer whether a move is complete, influenceable, or widespread without evidence.

## Evaluation Rules

- Treat team objective as the first routing decision when `team_id` is known: team `0` retention, team `6` prospecting, team `7` commercial-program targeting.
- Use brokerage brand classification inside the team objective. When team objective is unavailable, Royal LePage means retention-first and non Royal LePage means prospecting-first.
- Keep brokerage posture and contact-level commercial-program targeting separate. A commercial-program target can exist inside either brand posture.
- For Royal LePage agents, treat agent retention as the default people-level routing decision unless the evidence is purely about data hygiene.
- Distinguish `retain` from `recruit`. If the person is already in-brand and the issue is preventing departure, it is retention first.
- For Royal LePage brokerages, do not frame the primary recommendation as recruiting unless the evidence is about bringing in external talent. The brokerage itself is not a prospect; it is a retention relationship.
- For non Royal LePage brokerages, do not frame the brokerage itself as a retention account. The brokerage is a prospecting target unless the user explicitly asks for competitor or market monitoring without outreach.
- For contact- or agent-level commercial-program analysis, allow targeted outreach or support recommendations across both Royal LePage and non Royal LePage brokerages when the program applies, while keeping the brokerage-level readout intact.
- Distinguish an individual move from a team or brokerage pattern. One contact record does not automatically represent a broader trend.
- Treat high-influence departures and team-lead signals as materially different from ordinary roster churn.
- If the record implies a move but the notes are thin, classify it as a status-clarification problem before treating it as confirmed recruiting opportunity or loss.
- State whether the movement creates upside, downside, or both across recruiting, retention, and competitor visibility.

## Questions To Answer In Layered Output

- Is this signal about retention pressure inside Royal LePage, prospecting upside outside Royal LePage, or stale source data?
- If this is a Royal LePage agent, is agent retention the primary posture and commercial-program targeting only a secondary eligible path?
- Is there also a contact- or agent-level commercial-program reason to target this person regardless of brokerage brand?
- How much influence does the person or team have on brokerage health?
- Is the signal isolated or part of a broader movement pattern?
- What must be clarified before outreach, escalation, or source correction?

## Layer Guidance

- `summary.md` `## Memory`: preserve durable affiliation history, influence profile, and prior movement patterns.
- `summary.md` `## Tensions`: capture the current move signal, ambiguity, and business exposure.
- `summary.md` `## Insight`: explain whether the franchise should read this as Royal LePage retention risk, non Royal LePage prospecting upside, contact-level commercial-program targeting, or data-quality ambiguity.
- `summary.md` `## Proposed Actions`: recommend only a few high-leverage retention moves for Royal LePage agents and brokerages, prospecting moves for non Royal LePage, or commercial-program moves for eligible contacts/agents across either brand, tied to current evidence.

## Do Not Conclude Recruiting Or Attrition Pattern When

- the only signal is a stale or unexplained contact field
- a single departure is used to infer brokerage-wide instability without support
- the analysis ignores whether the person is actually influential
- the recommended action assumes outreach authority or owner approval that is not in evidence
