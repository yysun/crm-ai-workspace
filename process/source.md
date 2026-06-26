# Source Process

## Purpose

Define the durable evidence snapshot generated from local CRM exports for an object and its surrounding franchise context.

Source answers: what does the generated local evidence say, what supporting notes or records matter, and what is still unknown before judgment starts?

`source.md` is the only layered file that should stay strictly factual. It is not the place for risk labels, recommendations, or business conclusions.

Read-only CRM API lookup may help find or inspect a record before a source exists, but API lookup output is not a substitute for a generated local source layer. If live lookup reveals evidence missing from local exports, refresh or regenerate local evidence before creating `source.md`; if the evidence still cannot be reproduced locally, record the missing coverage as a limit rather than copying unsupported live facts into the durable layer.

## Inputs

Allowed inputs:

- dated local account or contact export files under `data/{teamId}/{yyyy}/{mm}/{dd}/`
- dated local note export files under `data/{teamId}/{yyyy}/{mm}/{dd}/notes/`
- raw local CRM exports under `data/raw/` produced by either `scripts/download-data-sql.js` or `scripts/download-data.js` before `scripts/build-date-tree.js`
- generated `*-source.md` files created by `scripts/generate-source.js`
- existing older in-place `*-source.md` files only as a comparison aid, never as substitute evidence
- user-supplied evidence for the current run, when explicitly identified as user-supplied

Allowed pre-source lookup aids:

- `scripts/search-index.js` local index search for ordinary account/contact resolution
- `scripts/search-crm.js` read-only account/contact search and related-note inspection, using endpoints documented in `api.yaml`, only when `AIW_ENABLE_CRM_API=1` is set

Use `scripts/search-index.js` before API lookup when the local index exists and is current enough. Use `scripts/search-crm.js` only when `AIW_ENABLE_CRM_API=1` is set and the task needs live/fresh/latest data, note inspection, recent-change confirmation, or when local index results are missing, stale, ambiguous, or contradicted by the task.

Lookup aids may identify an object ID, account/contact name, or missing local coverage. They do not belong in `source_files` unless their output is saved as an explicit user-supplied or generated local evidence file for the run.

SQL-backed refresh is allowed as a raw export source when the workspace `.env` provides `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, and `SQL_PASSWORD`. The durable evidence boundary remains the generated local dated files and `*-source.md`; direct SQL query output is not source-layer evidence until it has been exported through the raw/date-tree/source pipeline.

Do not use chat history, prior insights, or prior actions as evidence unless the same information is present in the generated source layer or explicitly provided by the user for this run.

## Creation Rules

- Create or refresh `source.md` before producing `summary.md`.
- Preserve the team boundary from the dated path and frontmatter. CRM team `-1` is stored as workspace team `0`.
- Nothing enters the active knowledge chain unless the source layer can tie it to a real local source file, a real business object, and a clear coverage window.
- Record only what the generated local evidence says or what the user explicitly supplied for the run.
- Do not copy live API lookup output into `source.md` merely because it appeared in the terminal. Refresh local exports first, or mark the local source coverage gap.
- Preserve uncertainty. If a field is missing, contradictory, or unclear, write `Unknown` instead of implying a value.
- Keep facts separate from implications. A competitor name belongs here if the generated source says it; competitor risk does not.
- Capture source-file context only when it materially improves traceability, but do not turn the source into a storage log.
- Include enough franchise context to support downstream judgment without forcing later layers to re-open local export files.
- Prefer concise evidence bullets over exhaustive field dumps. Include the fields that matter to franchise interpretation.
- Do not invent object IDs, source coverage, note timing, or relationship linkage when the local evidence does not supply them.

## Minimum Evidence Sections

Every `source.md` must include these sections after frontmatter:

```md
## Object Snapshot

- Primary object: ...
- Object role: brokerage | owner | operator | team leader | agent | office | territory | franchise relationship | unknown
- Team objective: RLP retention + contact commercial program | non-RLP prospecting | contact commercial program | unknown
- Brand evidence: Royal LePage name detected | no Royal LePage marker detected | unknown
- Brand posture candidate: Royal LePage / retention context | non-RLP / needs confirmation | unknown
- Commercial program posture: targeted contact/agent | not indicated | unknown
- Scope: isolated | team | brokerage | market | unknown
- Status: confirmed | in progress | rumored | stale/unclear | unknown
- ...

## Franchise Facts

- ...

## Evidence Inventory

- ...

## Key Unknowns

- ...

## Limits

- ...
```

## Object Snapshot Rules

The `Object Snapshot` section should capture the highest-value identifying and structural facts that the generated source provides, such as:

- primary object name and ID
- workspace team ID and team objective when known
- linked account or contact names and IDs when relevant
- role in the franchise system if visible
- office, city, province, market, or territory markers when relevant
- active or inactive status when present
- lifecycle status in frontmatter: use `active` unless the local export explicitly marks the record closed, inactive, archived, completed, terminated, cancelled, disabled, deleted, or `isActive: false`
- affiliation, future affiliation, previous affiliation, or recruiting source when present
- whether the object has a Royal LePage name marker in the local source evidence or user-provided identifier
- whether a non-Royal-LePage posture is only a script-derived candidate that still needs agent confirmation from the full source layer
- whether the object is being analyzed under a contact- or agent-level commercial program when that comes from source evidence or the user request
- contract or ownership fields when present and relevant
- the active dated bucket or other clear time markers needed for downstream traceability

Do not include every CRM field. Include the facts most likely to shape franchise interpretation.

## Franchise Facts Rules

Use this section to normalize the important factual signals into franchise terms without adding judgment. Examples:

- contract end date exists and is within the next 12 months
- local account or linked-account naming contains a Royal LePage marker, so Royal LePage retention context is a brand-posture candidate inside the team objective
- local account or linked-account naming contains no Royal LePage marker, so non-RLP posture needs confirmation from the broader source layer before prospecting judgment is asserted
- team `0` indicates Royal LePage retention with supported contact commercial-program opportunity
- team `6` indicates non-Royal-LePage prospecting
- team `7` indicates contact commercial-program targeting
- contact is in a commercial program that can target agents across either brokerage brand
- current owner is named, incoming owner is unknown
- future affiliation is set to another brand
- notes mention APA or IBA dependency
- notes describe agent movement affecting three team members

This section may restate facts in a more business-readable way, but it must remain evidence-backed and non-interpretive.

## Evidence Inventory Rules

- Summarize the most relevant notes, related records, and raw record facts.
- Prefer dated, attributable bullets such as `Account note 1257 from 2025-05-22 says ...`.
- Include both supporting and contradictory evidence when both exist.
- Make freshness visible. Old evidence should remain old, not rewritten as current state.

## Key Unknowns Rules

- List the missing facts that block safe franchise conclusions.
- Favor unknowns that matter to renewal, ownership, recruiting, competition, or brokerage health.
- If a fact cannot be verified from the generated source layer or local exports, say so.

## Limits Rules

Use this section for evidence quality boundaries such as:

- notes are sparse, stale, or placeholder-like
- source fields conflict with notes
- only account-level context exists for a contact-level question
- no local export or generated source exists for the missing object or task type
- live lookup found a CRM record or note that is absent from the generated local export/source coverage

## Quality Bar

Good sources are traceable, factual, franchise-relevant, and explicit about uncertainty.

Bad sources are raw dumps, storage logs without business facts, or early interpretations disguised as evidence.

## TTL

Default TTL: `none`.

Even without a TTL expiry, refresh `source.md` whenever local exports add newer evidence during a later run.

## Validation Checks

Before calling `source.md` valid, confirm:

- Frontmatter includes `created_at`, `updated_at`, `ttl`, `expires_at`, `status`, `source_date`, and `source_files`.
- Frontmatter `status` is the routing lifecycle status. Closed-style values exclude the source from normal distillation and active daily-triage scope.
- `source_files` points only to existing, non-secret local export files, generated source files, or user-supplied evidence files used in the run.
- Required sections are present: `Object Snapshot`, `Franchise Facts`, `Evidence Inventory`, `Key Unknowns`, and `Limits`.
- Evidence bullets stay factual and do not include predictions, recommendations, or risk labels.
- Script-derived brand labels distinguish evidence from judgment: lack of a Royal LePage name marker is not by itself proof of non-RLP prospecting posture.
- Unknown facts that block renewal, ownership, recruiting, competitive, or brokerage-health judgment are marked `Unknown`.
- Any missing local evidence coverage is described as a limit, not worked around through invention.
- Any live lookup used for resolution is either reproduced by local source files or documented as missing local coverage.
- The file identifies a real object, a real evidence set, and a clear coverage window that downstream layers can carry forward.

## Do Not Put In Sources

- predictions, recommendations, or escalation language
- inferred owner intent, churn likelihood, or competitor strategy
- synthesized memory, tension, insight, or action content
- facts copied from older layers when not supported by current source evidence
- invented object identifiers, inferred coverage windows, or unsupported linkage between records
