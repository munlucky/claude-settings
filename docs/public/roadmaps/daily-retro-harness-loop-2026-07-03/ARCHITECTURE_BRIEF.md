# Architecture Brief

## Mode Classification

- Mode: `meta_harness_design`
- Input source: user-supplied retro plan attachment, summarized into this package without retaining local attachment paths.
- Target repository: `C:\dev\moonshot-relay`
- Project ID: `munlucky-moonshot-relay`, resolved by `node scripts/project-identity.mjs --json`
- Architecture package path: `docs/public/roadmaps/daily-retro-harness-loop-2026-07-03`
- Handoff target: `moonshot-plan-writer`, then `moonshot-phase-runner`
- Implementation status: implemented by follow-up `moonshot-phase-runner` execution; this architecture package remains the design source.

## Current Fit

Moonshot Relay already has the source/runtime boundary needed for this feature:

- canonical source lives under `skills/`, `agents/`, `rules/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `docs/public/`, and allowlisted `scripts/`.
- generated runtime state, logs, sqlite state, memorygraph data, browser artifacts, and verdict JSON are excluded from package payloads.
- `package.json` already exposes `moonshot-relay` through `bin/moonshot-relay.mjs`; the bin currently routes `install`, `bridge`, and `delivery`.
- `tools/harness-lab/harness-history.mjs` already creates a read-only advisory history/index/frontier over lab run artifacts and marks outputs with `promotionAuthority: false`.
- public roadmap packages already live under `docs/public/roadmaps/**` with architecture artifacts, ADRs, traceability, and planning-loop review evidence.

The retro loop should therefore be a new advisory plane adjacent to harness history, not a replacement for it.

## Final Design Boundary

The planned retro loop has two separate locations:

```text
source checkout
  schemas/retro.*.schema.json
  templates/retro/**
  tools/retro/**
  skills/moonshot-retro/**
  docs/public/guidelines/daily-retro-workflow.md
  docs/public/guidelines/daily-retro-workflow.ko.md
  tests/retro-*.test.mjs

runtime state
  .moonshot-relay/retro-outbox/<YYYY-MM-DD>/*.collect.json
  ${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/**
```

Source commits define contracts, commands, tests, docs, and skill behavior. Runtime state stores collected facts, derived daily reports, candidate JSON, proposal markdown, and issue drafts.

## Authority Rule

Retro artifacts are advisory only:

- `collect` writes a validated project outbox record from task closeout evidence when the project uses Moonshot Relay's collector.
- `import` copies validated collect records into the retro inbox.
- `daily` aggregates patterns and risk signals.
- `propose` renders improvement candidates and proposal markdown.
- `issue-draft` renders issue bodies without creating remote issues.

No retro command may:

- change verification, score, closeout, or promotion decisions
- edit source automatically from a retro finding
- write GitHub issues by default
- install or mutate `.claude/**`, `.codex/**`, or account-root runtime profiles

## Knowledge Anchor Disposition

Root `AGENTS.md` describes `knowledgeAnchors`, but this repository root declares no concrete project-local anchor entries. No agreement package was consumed.

## Context Builder Result

`node scripts/architecture-context-build.mjs --stage plan --mode meta_harness_design --cwd C:\dev\moonshot-relay --json` returned:

- `status: degraded`
- `strictness: advisory`
- `blocking: false`
- `projectKnowledgeStatus: not_configured`

This is non-blocking because the current package is grounded in repository files and the supplied plan rather than account-root knowledge records.
