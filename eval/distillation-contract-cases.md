# Distillation Contract Cases

## Purpose

These cases check the judgment contract that structural validators cannot prove. Use them during reviews, large distillation runs, process changes, and any claim that a workflow was validated semantically.

The structural scripts answer: does the artifact have the required shape?

These cases answer: did the agent make the right kind of franchise judgment from the current source layer?

## How To Use

For each relevant case, inspect the current `source.md`, selected process files, object overlay, scenario file when applicable, and resulting `summary.md` or briefing output. Mark the case pass/fail in the run notes or review notes. Do not treat a passing structural validator as a substitute for these checks.

## Cases

### CRM Boundary

- Input condition: the user requests lookup, daily publish, or archive publishing.
- Pass condition: CRM reads use only documented read-only helper scripts; CRM account/contact/note writes are not attempted; Inbox or Actions publishing happens only through the explicit gated script selected by the process contract.
- Fail condition: the agent refuses allowed read-only lookup or gated Inbox publishing because it treats all CRM contact as forbidden, or it writes to account/contact/note records.

### Daily Scope

- Input condition: the user says `distill`, `distill today`, or runs the default daily process without a wider range.
- Pass condition: audit uses `distillation-find-refresh-targets.js --from={as-of-date} --to={as-of-date}` and does not expand to the full missing/stale backlog.
- Fail condition: the agent runs an unscoped backlog audit or distills unrelated older targets without explicit user scope.

### Source Brand Evidence

- Input condition: generated source has account/contact names but no `Royal LePage` marker.
- Pass condition: `source.md` records `Brand evidence: no Royal LePage marker detected` and `Brand posture candidate: non-RLP / needs confirmation`; the summary confirms or downgrades posture using the broader source layer and team objective.
- Fail condition: the source or summary treats name absence alone as proof of confirmed non-RLP prospecting posture.

### Object Rule Table

- Input condition: an account or contact summary is created or refreshed.
- Pass condition: the agent applies the matching object overlay, uses the rule table thresholds, and avoids rows whose required input fields are absent.
- Fail condition: the summary makes a retention, recruiting, ownership, commercial-program, or competitive judgment without a satisfied rule row or equivalent scenario support.

### Scenario Selection

- Input condition: source evidence shows renewal, ownership transition, recruiting, or competitive-risk pressure.
- Pass condition: the agent reads the matching scenario process and uses it to shape memory, tensions, insight, and actions.
- Fail condition: the agent leaves a scenario-specific issue as generic relationship language or mixes incompatible scenarios without explaining the active mechanism.

### Evidence Chain

- Input condition: a summary contains `## Tensions`, `## Insight`, or `## Proposed Actions`.
- Pass condition: each downstream judgment traces back to current `source.md`, a real object, a clear coverage window, and the relevant memory/tension/insight chain.
- Fail condition: actions appear without a supported insight, insight appears without source-backed memory or tension, or any material judgment depends on chat history, old summaries, or live API output not refreshed into local source coverage.

### Action Shape

- Input condition: a summary includes `## Proposed Actions`.
- Pass condition: each action is a checkbox with an action type and business purpose; rationale, preconditions, and local-state notes are nested under the checkbox when needed.
- Fail condition: the summary adds top-level `## Rationale`, `## Preconditions`, `## Franchise Purpose`, or `## Not Tasks Yet` sections, or presents local recommendations as CRM tasks.

### Inactive Retirement

- Input condition: current source evidence shows an account or contact is inactive, closed, archived, completed, unaffiliated, or otherwise no longer active for franchise follow-up.
- Pass condition: `## Memory` records the inactive state and source-backed reason or uncertainty; tensions, insight, and proposed actions are omitted unless a separate active franchise consequence is supported.
- Fail condition: stale pressure or old actions are carried forward after the object is no longer active.

### Daily Triage Authorship

- Input condition: a daily triage brief and Marp/PDF outputs are requested.
- Pass condition: the agent authors the written brief and Marp content from the current action snapshot/report; deterministic rendering may export matching PDFs.
- Fail condition: a script generates, rewrites, summarizes, or adapts the brief or Marp content, or a PDF is produced without a matching current Marp source.
