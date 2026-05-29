# Requirement: Inbox-Only Action Queue

## Problem

The workspace currently publishes the same accumulated action content to two CRM destinations: a full daily Markdown report in the `Actions` table and checkbox-level rows in the `Inbox` table. That creates an avoidable product split. Operators should not have to decide whether the CRM `Actions` table or `Inbox` is the real work queue.

## Decision

The CRM `Inbox` is the only default operational queue. Local accumulated-action artifacts remain the deterministic state and audit source. CRM `Actions` posting becomes an explicit archive action, not part of the normal daily publish path.

## Acceptance Criteria

- Daily process documentation says the default publish target is enriched `Inbox` rows, not CRM `Actions` rows.
- CRM `Actions` posting remains available only for explicit archived daily snapshots.
- `post-inbox.js` posts active checkbox work items with enough trace to understand the business reason without opening the separate daily action report.
- `post-inbox.js` also posts same-day removed actions so stale Inbox rows can be closed or superseded.
- The Inbox API contract documents the enriched fields and removal statuses.
- Existing local accumulated-action generation remains unchanged as the state boundary for triage, briefings, and trace.
- Validation covers active payload parsing, trace enrichment, and removal payload generation.

## Non-Goals

- Do not remove `scripts/post-accumulated-actions.js`; it is still useful for explicit archive runs.
- Do not script or automate agent-authored distillation.
- Do not publish CRM writes during validation.
