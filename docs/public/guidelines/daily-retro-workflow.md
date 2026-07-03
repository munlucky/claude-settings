# Daily Retro Workflow

Moonshot Relay retro work is an advisory learning loop. It records task closeout summaries, aggregates repeated patterns, and renders improvement candidates for human review.

## Authority

- Retro output is not completion evidence.
- Retro output cannot change verify, score, closeout, runtime DB authority, package promotion, or installed profile state.
- Generated retro JSON and proposal artifacts must declare `promotionAuthority: false`.

## Source And Runtime Boundary

Canonical source defines schemas, templates, tools, skills, docs, and tests. Runtime retro records are generated state and belong under project outboxes or account-root project state.

Use source for contracts:

```text
schemas/retro.*
templates/retro/
tools/retro/
skills/moonshot-retro/
docs/public/guidelines/daily-retro-workflow.md
tests/retro-*.test.mjs
```

Use runtime state for generated records:

```text
.moonshot-relay/retro-outbox/<YYYY-MM-DD>/
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/
```

## Flow

```text
task closeout evidence
  -> collect record
  -> retro import
  -> retro inbox
  -> daily retro report
  -> improvement candidates
  -> proposal or issue draft
```

## Safety Rules

- Store evidence references and compact summaries, not raw logs, prompts, transcripts, browser scrapes, MemoryGraph dumps, KG dumps, ontology dumps, or secrets.
- Reject secret-like content before import.
- Treat a single downstream project symptom as an observation unless it is contract-backed, source/template-backed, cross-project, or represented by a project-neutral failing or missing regression test.
- Render issue drafts locally first. Remote issue creation requires a later explicit approval path.

## Verification

Retro implementation must provide focused tests for schema validity, redaction, duplicate handling, daily aggregation, proposal rendering, issue draft rendering, and no-promotion authority. `npm test` remains the final source gate.

