# Requirement: Inbox Action Contract

## Problem

CRM Inbox rows are currently too hard to scan and too easy to misread because one checkbox action can contain multiple jobs, a long operational sentence, and a purpose statement all in the same `ActionText`. The UI then has no clean title to show, so it either displays a wall of text or derives a weak label from prose that was never meant to be a title.

The Wolstencroft row exposed the failure clearly: `Confirm Wolstencroft's leadership coverage after Roman St. Germain's resignation. Purpose: protect continuity and understand whether REW.ca creates any account-level competitive exposure.` is stored as one action, but it actually asks for leadership coverage confirmation and competitive exposure assessment. That creates unclear ownership, unstable completion semantics, and poor Inbox ergonomics.

The old pattern also mixes grammar: some actions use a category tag followed by a colon, while others read like pseudo-titles such as `Propose:`. Operators should not have to infer whether the colon marks a category, title, verb, or action body.

## Requirement

The Inbox action contract must make each checkbox row a single, atomic operational action with a short display title, a full action instruction, a category, and evidence-only trace content.

Each Inbox action must have:

- exactly one operational job that can be owned and completed independently
- a short `ActionTitle` suitable for Inbox list display
- a full `ActionText` that states the work to perform without pretending to be the title
- a normalized category or review lane distinct from the title and action text
- evidence-only `TraceMarkdown`
- separate judgment fields for insight, tensions, and memory when those fields are still needed by the detail pane

Compound action text must be split before it becomes Inbox work. If one proposed action asks an operator to confirm one fact and assess another risk, those are two checkboxes unless they are inseparable in the same owner conversation and have one completion state.

`TraceMarkdown` may include source note evidence when that note content directly supports the action. Good trace content includes the object key, relevant dates, source action report path, source note ID/date/title when available, and a bounded excerpt or bullet from the local generated source layer. The note excerpt belongs in trace because it is evidence, not because it is a summary. The trace must not include inferred insight, tension, memory, recommendation prose, or a restated judgment layer.

The source of truth for action content remains the judgment layer and accumulated-action queue, not a last-mile display hack. Existing `*-summary.md` files may be mechanically updated only when replacements are explicit and reviewed; scripts must not invent business judgment or silently split actions based on string patterns alone.

For broader remediation, the workspace must provide a batch orchestration script that can invoke Codex CLI workers in parallel to redo assigned `*-summary.md` files from existing local source evidence. The default worker model level is GPT-5.5 medium. The script may create manifests, assign disjoint write ownership, launch Codex CLI, and collect status, but the worker agents must author the summaries from `AGENTS.md`, the relevant `process/` contracts, assigned `*-source.md` files, and referenced local note files. The script must not draft, transform, or split judgment text itself.

The workspace must also provide a top-level daily Inbox pipeline orchestrator that can run the operational sequence end to end: refresh local CRM data when requested, build dated exports and source layers, audit summary targets, invoke the Codex CLI batch remediation workflow, validate outputs, rebuild accumulated actions, rebuild indexes, dry-run Inbox publishing, and post Inbox rows only when the dry-run passes and the explicit write gate is enabled. This orchestrator is a coordinator and guardrail layer, not a summarizer. It must stop with a clear report when any required step fails, when worker outputs are missing, when validation finds summary defects, or when publishing gates are absent.

The user-facing Inbox must show the short title first and keep the full instruction available in detail context. `TraceMarkdown` must not carry summary, insight, tensions, memory, or title fallback content.

## Acceptance Criteria

- [ ] A CRM Inbox row can expose a short `ActionTitle` separately from the full `ActionText`.
- [ ] The Inbox list can display `ActionTitle` without truncating or parsing `ActionText`.
- [ ] Each posted Inbox checkbox represents one independently completable action.
- [ ] Compound proposed actions are detected before posting and either rejected, reported for review, or split through explicit reviewed replacements.
- [ ] Action category or lane is represented separately from both `ActionTitle` and `ActionText`; category punctuation is not used as a fake title convention.
- [ ] `ActionText` does not rely on `Purpose:` to combine multiple jobs into one row.
- [ ] `TraceMarkdown` remains evidence trail only: object key, relevant dates, source action report path, removal context when applicable, and the action item.
- [ ] `TraceMarkdown` can include bounded local source note evidence, including note ID/date/title and the directly relevant excerpt, when that note evidence supports the action.
- [ ] Insight, tensions, and memory remain separate fields and do not appear inside `TraceMarkdown`.
- [ ] Rebuilding accumulated actions and reposting Inbox rows preserves stable history where the action did not materially change, and produces clear superseded/removed rows where an old compound action was replaced by atomic actions.
- [ ] The Wolstencroft example can be represented as separate atomic actions with titles such as `Confirm Wolstencroft leadership coverage` and `Assess REW.ca competitive exposure`.
- [ ] A batch remediation script can build a fixed manifest and invoke parallel Codex CLI workers using GPT-5.5 medium to redo assigned `*-summary.md` files.
- [ ] Each Codex CLI worker receives a disjoint write set and can write only its assigned sibling `*-summary.md` paths.
- [ ] The batch script does not generate summary prose, split actions by heuristic, or rewrite judgment text without an agent authoring the assigned summary from source evidence.
- [ ] A top-level daily Inbox pipeline orchestrator can chain refresh, source generation, target audit, Codex CLI batch summary remediation, summary validation, accumulated-action rebuild, index rebuild, Inbox dry-run, and gated Inbox posting.
- [ ] The orchestrator can run in dry-run mode that performs every non-writing validation and reports the exact publish command that would run without writing CRM or SQL Inbox rows.
- [ ] The orchestrator refuses live posting unless the selected publish path dry-run passes and the matching explicit write gate is set.
- [ ] The orchestrator treats `post action` as Inbox row publishing by default and does not post CRM `Actions` archive snapshots unless explicitly requested.
- [ ] Validation can prove that no current Inbox payload contains structural `#### Insight`, `#### Tensions`, `#### Memory`, `Latest summary`, `Source summary`, or inferred judgment content inside `TraceMarkdown`.

## Constraints

- Existing CRM account, contact, and note records must not be written from this workspace.
- Inbox publishing must stay behind the explicit existing write gates for API and SQL paths.
- The local `data/` layer remains the durable evidence boundary for generated sources, summaries, accumulated actions, and triage state.
- Scripts may audit, validate, apply explicit reviewed replacements, rebuild deterministic queue state, and publish gated Inbox payloads.
- Scripts must not infer business judgment, invent action splits, or rewrite `*-summary.md` action meaning from heuristics alone.
- Batch scripts may invoke Codex CLI workers, but must freeze target ownership in a manifest before workers start and must keep worker write scopes disjoint.
- GPT-5.5 medium is the default model level for normal `*-summary.md` remediation; higher effort may be reserved for flagged high-risk or ambiguous summaries.
- The daily orchestrator may call existing deterministic scripts and Codex CLI worker batches, but must not bypass their validation contracts or write gates.
- The daily orchestrator must support a no-refresh mode for targeted existing-source remediation and a refresh mode for latest CRM state; it must not silently pull data when the operator requested local-only remediation.
- Existing active Inbox rows and historical superseded rows must be migrated or repaired in a way that does not erase why old action keys changed.
- The solution must handle both API Inbox posting and direct SQL Inbox posting consistently.
- The UI must not depend on brittle punctuation parsing of `ActionText` to decide what title to show.
- Source note excerpts in `TraceMarkdown` must come from local generated source artifacts, not undocumented live CRM lookup or unbounded raw note dumps.
- Source note excerpts must be bounded to the minimum text needed to support the action, with source identifiers preserved so the operator can trace back to the local evidence layer.

## Non-Goals

- Do not use `TraceMarkdown` as a display title, action summary, or combined narrative field.
- Do not put whole CRM notes into `TraceMarkdown` when a smaller directly relevant excerpt supports the action.
- Do not move `## Insight`, `## Tensions`, `## Memory`, or proposed-action rationale into `TraceMarkdown` under the label of note evidence.
- Do not split every sentence containing `and`; some legitimate atomic actions include conjunctions.
- Do not bulk rewrite `*-summary.md` judgment text through unreviewed script-generated replacements.
- Do not merge CRM `Actions` archive behavior back into the operational Inbox flow.
- Do not make the daily orchestrator an implicit CRM `Actions` archive publisher.
- Do not let the daily orchestrator hide failed worker, validation, dry-run, or publish steps behind a partial success message.
- Do not require operators to resolve title/action/category ambiguity manually in the UI.
- Do not solve this by only changing CSS truncation or list rendering.
