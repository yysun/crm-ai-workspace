# Contact Object Contract

## Object Boundary

The contact object answers: what durable franchise-business truth should be remembered about this person, how do they relate to the account, and do they represent retention, prospecting, or commercial-program potential?

For contact memory extraction:

- Apply the team objective first. Team `0` contacts are retention-first with supported commercial-program potential as a secondary lens, team `6` contacts are prospecting-first, and team `7` contacts are commercial-program-first.
- Start with the contact's role in the account: owner, operator, team leader, agent, influencer, or unknown.
- Read the person through the account's brand posture first, then add people-level commercial-program potential when supported.
- Royal LePage agents default to retention at the people level; confirmed non Royal LePage contacts default to prospecting unless the user asked for another lens. A generated `no Royal LePage marker detected` source label is only a confirmation prompt, not proof of that posture by itself.
- Commercial-program potential can apply across both Royal LePage and non Royal LePage brokerages, but it does not change the brokerage's classification.
- In team `7`, the commercial-program lens is primary rather than secondary; still preserve brokerage context so the contact is not detached from the real account relationship.

## Stable ID Source

- Prefer the CRM contact primary key used by the dated storage layout.
- If the business system does not expose a stable contact ID, do not create `data/{teamId}/{yyyy}/{mm}/{dd}/contacts/{id}/` artifacts for the object.

## Rule Table

| Situation Type | Key Input Fields | Minimum Trigger Threshold | Tension | Judgment Direction | Suggested Action | Prohibited Misuse |
| --- | --- | --- | --- | --- | --- | --- |
| Royal LePage retention signal | contact role, linked account brand, owner sensitivity, move or dissatisfaction notes, production or influence clues | The source shows the contact is inside Royal LePage and includes credible movement risk, dissatisfaction, or elevated influence | An in-brand person may weaken the account if they disengage or leave | Store memory around retention posture, influence level, and the account consequence if the person moves | Preserve the durable relationship fact pattern for future retention work | Do not treat every Royal LePage contact as a recruiting lead simply because they are commercially relevant |
| Non Royal LePage recruiting access | contact role, linked account brand, brokerage posture, recruiting or affiliation notes, team scope | The source shows the contact is attached to a non Royal LePage brokerage and has influence, openness, or movement signals | The person may provide a credible entry path into an out-of-brand account or team | Store memory around prospecting access, influence, and what makes the contact recruitable | Preserve the durable recruiting path and relationship value | Do not assume one receptive contact means the full brokerage is ready to switch |
| Commercial-program potential | product or program fit clues, role, production/influence hints, stated needs, account context | The source contains explicit evidence that the person could benefit from or qualify for a commercial program, regardless of brokerage brand | A secondary monetization or service path may exist without changing the brokerage's franchise posture | Store memory around the person's likely program fit and why it matters commercially | Flag cross-brand commercial-program eligibility as a secondary memory lens | Do not let commercial-program fit replace Royal LePage retention or non Royal LePage prospecting as the primary posture |
| Team 7 commercial-program target | team ID, commercial-program posture, contact role, account context, production/influence hints, stated commercial needs | The source is in team `7` and the contact can be tied to a real account or role, even if detailed fit is still incomplete | The contact may be commercially relevant, but eligibility, need, or access path may be unclear | Store memory around commercial-program fit, account context, role, and qualification gaps | Route follow-up toward commercial-program qualification and contact access | Do not dilute team `7` into generic retention or prospecting unless source evidence separately supports that scenario |
| Relationship owner or internal champion | role, decision authority, response history, introductions, internal advocacy, coordination behavior | Repeated evidence shows the person influences access, sentiment, or internal decision flow for the account | The relationship may be bottlenecked or accelerated by one person | Store memory around who this person is to the account and how they affect progress | Preserve the durable influence map for future coordination | Do not overstate authority when the source only shows participation rather than decision control |
| Data-quality or relationship ambiguity | missing account linkage, conflicting brokerage fields, stale move status, unclear brand affiliation | The source cannot cleanly resolve who the contact belongs to, whether the move happened, or which posture applies | The wrong relationship read could send the franchise down the wrong path | Store only the ambiguity that must be remembered for future clarification | Route follow-up toward source clarification before escalation | Do not create confidence-heavy memory when the core account relationship is unresolved |

## Judgment Boundary

- The contact object is about a person's role in a franchise relationship, not a stand-alone biographical summary.
- Always interpret the contact together with the linked account when that account is known.
- Separate people-level posture from brokerage-level posture. A Royal LePage agent can be a retention risk and still be a commercial-program candidate.
- In team `7`, make commercial-program targeting the first people-level posture, then record whether the linked brokerage context is Royal LePage, non Royal LePage, or unresolved.
- Distinguish isolated contact activity from team, brokerage, or market implications unless the source supports broader scope.
- If the contact's role, influence, or brand alignment is unclear, keep the uncertainty explicit instead of forcing a recruiting or retention conclusion.
- Do not use a single stale note or field change as proof of movement, loyalty, or dissatisfaction.

## Action Boundary

- Prefer memory that helps future franchise decisions: retain the person, recruit through the person, clarify their role, or evaluate program fit.
- Suggested actions should stay local and evidence-bound: clarify account linkage, confirm status, coordinate relationship owners, or assess program eligibility.
- Do not recommend external promises, CRM writes, or approval-gated actions from this layer.
- If the evidence is temporary or purely tactical, keep it in tensions or proposed actions instead of memory.
