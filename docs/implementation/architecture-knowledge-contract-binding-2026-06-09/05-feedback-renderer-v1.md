# Phase 05 - Feedback Renderer v1

## Objective

Add `scripts/architecture-feedback-render.mjs` to render actionable feedback when implementation or verification violates an architecture contract.

## Dependencies

- Phase 03.
- Phase 04.

## Owned Paths

- `scripts/architecture-feedback-render.mjs`
- `tests/architecture-feedback-render.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/violations/`
- `schemas/architecture/architecture-feedback.schema.json`

## Read-only Paths

- `skills/architecture-gate-reviewer/SKILL.md`
- `docs/public/guidelines/moonshot-architecture.md`
- `docs/public/guidelines/moonshot-architecture.ko.md`
- `schemas/architecture/architecture-contract-slice.schema.json`
- `schemas/architecture/architecture-handoff.schema.json`

## Staged Paths

- `ARCHITECTURE_HANDOFF.json` fixtures under test fixture roots only.

## Adoption Targets

- Source checkout only.

## Live Mutation Policy

No live profile or account-root mutation. Feedback renderer must be pure over input violation and contract/handoff refs.

## Acceptance Criteria

- CLI accepts contract or handoff ref, violation evidence JSON, and `--json`.
- Output artifact is `ARCHITECTURE_FEEDBACK`.
- Feedback includes violated constraints, evidence refs, read-before-retry refs, required action, and verification commands to rerun.
- Feedback handles missing or degraded contract state without inventing facts.
- Feedback output contains no raw KG, ontology, MemoryGraph, transcript, runtime log, browser scrape, or secret-like strings.

## Verification Signals

- `node --test tests/architecture-feedback-render.test.mjs`
- Leakage sentinel test for raw payload omission.

## Handoff Notes

The feedback renderer is the loop mechanism that makes an agent reread the exact decision or constraint it violated before retrying.
