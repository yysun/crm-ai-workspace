# Requirement: AIW Contract Fixes

## Problem

The workspace contracts contain several contradictions that can make a strict agent do the wrong thing: refuse allowed CRM reads or gated publishing, expand a daily distillation run into the full backlog, write action metadata as invalid top-level summary sections, treat weak brand-name absence as source fact, blur content authorship with deterministic PDF rendering, and overstate structural validation as semantic correctness.

## Decision

Tighten the contracts so the AIW boundary is explicit: agents author judgment, deterministic scripts organize evidence and render artifacts, source files separate factual classifications from posture judgment, and validation is described honestly as structural unless paired with contract-case evals.

## Acceptance Criteria

- `AGENTS.md` allows documented read-only CRM helper scripts and explicit gated Inbox/Actions publishing while still prohibiting CRM account, contact, and note writes.
- `process/daily-process.md` uses date-scoped `distillation-find-refresh-targets.js --from={yyyy-mm-dd} --to={yyyy-mm-dd}` for default daily runs.
- `process/action.md` keeps action rationale, preconditions, and purpose inside `## Proposed Actions` instead of introducing additional top-level summary headings.
- `scripts/generate-source.js` and `process/source.md` distinguish script-derived brand evidence from agent judgment and avoid treating lack of a Royal LePage name marker as confirmed non-RLP prospecting posture.
- Daily triage contracts allow deterministic Marp-to-PDF rendering while forbidding scripts from authoring or rewriting briefing content.
- The repo adds a lightweight semantic eval contract with concrete cases for judgment quality beyond structural validation.
- Focused checks confirm the edited scripts parse and the new contracts no longer contain the known contradictory wording.

## Non-Goals

- Do not run live CRM writes.
- Do not redesign the distillation validator into a full semantic evaluator in this pass.
- Do not rewrite existing summaries or source artifacts.
