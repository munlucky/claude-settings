# Moonshot Relay Current Architecture Brief

## Mode Classification

- Mode: `brownfield_codebase`
- Input source: current repository checkout at `C:\dev\moonshot-relay`
- Architecture package path: `docs/public/reference/moonshot-relay-current-architecture`
- Generated on: 2026-07-01
- Handoff target: `moonshot-plan-writer`, then `moonshot-phase-runner` for multi-phase harness/runtime changes

## Project Knowledge Context

`scripts/architecture-context-build.mjs --stage plan --mode brownfield_codebase --cwd . --json` returned `status: degraded` because the account-root project knowledge namespace has no configured records. The context is advisory and non-blocking.

## Knowledge Anchor Disposition

Root `AGENTS.md` documents the `knowledgeAnchors` format but does not declare concrete project-local anchors.

| Anchor ID | Disposition | Consumed Paths | Rationale |
|---|---|---|---|
| none | not_applicable | none | No concrete `knowledgeAnchors` entries were declared in root `AGENTS.md`. |

## Current Architecture Summary

Moonshot Relay is a source-owned workflow harness for Claude and Codex profiles. The repository separates canonical source, generated package payloads, local runtime profiles, account-root runtime state, public guidelines, and evaluation/lab tooling.

The active architecture is contract-first:

- `AGENTS.md`, `README.md`, and `docs/public/repository-layout.md` define source/runtime boundaries.
- `package/package-contract.yaml` and `package/runtime-surface.json` define package payload and public skill exposure.
- `skills/**`, `agents/**`, `rules/**`, `schemas/**`, `templates/**`, `scripts/**`, `tools/**`, `bin/**`, and `docs/public/**` are canonical source.
- `.claude/**`, `.codex/**`, `.moonshot-relay/**`, sqlite state, logs, traces, cache, browser artifacts, and verdict JSON are runtime/generated surfaces, not canonical source.
- `scripts/runtime-state.mjs`, `scripts/prepare-phase-runner-state.mjs`, and `scripts/lib/runtime-state-store.mjs` hold runtime state and completion authority paths.
- `tools/harness-lab/harness-lab.mjs` gives an external quantitative gate for harness changes.
- `scripts/architecture-*.mjs`, `schemas/architecture/**`, and `tests/moonshot-architecture-*.test.mjs` are the architecture-design support surface.

## Architecture Decision Summary

| ADR ID | Decision | Requirement Links |
|---|---|---|
| ADR-0001 | Keep canonical source separate from runtime/generated profiles. | REQ-001, REQ-004 |
| ADR-0002 | Keep Claude/Codex service profile skill discovery allowlisted while preserving full canonical skills in the shared payload. | REQ-002, REQ-004 |
| ADR-0003 | Keep completion authority in runtime-state evidence, not markdown presence or phase status alone. | REQ-003, REQ-005 |

## Handoff Readiness

Status: Ready for planning handoff.

The package maps requirements to ASRs, ADRs, spec deltas, task owners, and verification signals. No implementation is performed by this package.
