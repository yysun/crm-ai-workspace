# Test: Inbox Action Contract

## Purpose

Verify that the Inbox action contract works end to end without turning scripts into summary authors or hiding unsafe publish behavior.

## Scenario 1 - Wolstencroft Atomic Actions

Given local source evidence exists for account `101` under `data/0/2026/04/07/accounts/101/account-101-source.md` and local note evidence exists under `data/0/2026/04/07/notes/2232/note-2232-data.json`
When the Wolstencroft summary is remediated
Then the old compound action is replaced by independently completable actions
And each new action has a short title, a category/lane, and a full instruction
And `TraceMarkdown` includes only evidence metadata, bounded source note evidence, and the action item
And `TraceMarkdown` does not include Insight, Tensions, Memory, Latest summary, or Source summary sections.

## Scenario 2 - Inbox API And UI Title Contract

Given an Inbox payload contains `actionTitle`, action category/lane, and full `actionText`
When `/api/data/inbox` accepts and returns the row
Then the API response includes `actionTitle`, category/lane, and full `actionText`
And the AI Inbox list displays `actionTitle`
And the AI Inbox detail view preserves the full `actionText`
And legacy rows without `actionTitle` still display through the old parsed fallback until migrated.

## Scenario 3 - Batch Remediation Dry Run

Given a target set with at least two `*-source.md` files across one team/date scope
When `scripts/batch-remediate-summaries.js` runs in dry-run mode
Then it writes or prints a fixed manifest with source paths, summary paths, batch IDs, and object metadata
And every target belongs to exactly one batch
And each batch has a disjoint write set
And GPT-5.5 medium is the default worker model level
And the script does not generate or modify `*-summary.md` prose.

## Scenario 4 - Worker Write Boundary

Given a batch manifest assigns one worker a set of sibling `*-summary.md` paths
When the Codex CLI worker prompt is generated
Then the prompt names the assigned write paths
And the prompt requires reading `AGENTS.md`, relevant `process/` contracts, assigned source files, and referenced local note files
And the prompt forbids writing unassigned summaries, rebuilding indexes, rebuilding accumulated actions, and publishing Inbox rows.

## Scenario 5 - Daily Orchestrator Local-Only Mode

Given current local `*-source.md` files already contain the needed evidence
When `scripts/run-daily-inbox-pipeline.js` runs in local-only dry-run mode for a specific date/team scope
Then it does not run `scripts/refresh-crm-data.js`
And it audits summary targets
And it invokes or plans Codex batch remediation only for assigned targets
And it runs summary validation before accumulated-action rebuild
And it dry-runs Inbox posting without writing API or SQL rows.

## Scenario 6 - Daily Orchestrator Refresh Mode

Given the operator requests fresh CRM state
When `scripts/run-daily-inbox-pipeline.js` runs in refresh dry-run mode
Then it calls or plans `scripts/refresh-crm-data.js`
And it proceeds only through generated local source artifacts
And it refuses to distill or post if source generation, target audit, worker completion, or summary validation fails.

## Scenario 7 - Live Publish Gate

Given a clean Inbox dry-run has completed
When the operator requests live SQL Inbox publishing without `AIW_ENABLE_SQL_INBOX_UPSERT=1`
Then the orchestrator refuses to write
And reports the missing gate
And leaves CRM and SQL Inbox rows unchanged.

## Scenario 8 - CRM Actions Remains Archive-Only

Given the operator runs the normal daily Inbox pipeline
When the command does not explicitly request CRM `Actions` archive posting
Then the orchestrator posts or dry-runs Inbox rows only
And does not call `scripts/post-accumulated-actions.js`.
