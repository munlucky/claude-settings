# Phase 08 - Regression and Closeout Gates v1

## Objective

Add full positive and negative regression coverage for knowledge contract binding and define source closeout gates.

## Dependencies

- Phase 01.
- Phase 02.
- Phase 03.
- Phase 04.
- Phase 05.
- Phase 06.
- Phase 07.

## Owned Paths

- `tests/moonshot-architecture-contract-binding-flow.test.mjs`
- `tests/moonshot-architecture-regression.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/`
- `package.json`
- `docs/public/guidelines/moonshot-architecture.md`
- `docs/public/guidelines/moonshot-architecture.ko.md`

## Read-only Paths

- `scripts/runtime-state.mjs`
- `scripts/verification-plane.mjs`
- `scripts/phase-final-guard.mjs`
- `schemas/verification.contract.yaml`
- Live account-root runtime homes.

## Staged Paths

- Execution artifacts under `docs/implementation/architecture-knowledge-contract-binding-2026-06-09/execution/` when phase-runner is used. These remain runtime scratch, not package payload.

## Adoption Targets

- Source closeout.
- Package dry-run evidence.
- Optional future account-root sync only after explicit user approval.

## Live Mutation Policy

No live account-root mutation in this phase. Source completion and live rollout are separate closeout claims.

## Acceptance Criteria

- Positive flow: objective/path/stage selects KG/ontology records, binds contract, builds ready handoff, and exposes verification signals.
- Positive flow: knowledge anchor is consulted and records consumed paths without copying raw document bodies.
- Negative flow: blocking constraint without enforcement blocks binding.
- Negative flow: execution handoff without verification signal blocks handoff.
- Negative flow: Brownfield without repository evidence or path boundary blocks contract.
- Negative flow: owned/read-only overlap blocks contract.
- Negative flow: raw KG, ontology, memory, log, transcript, browser scrape, and secret-like sentinels are omitted or rejected.
- Negative flow: blocked handoff cannot dispatch.
- Active `npm test` includes the new contract binding tests.
- `npm run test:package` passes after package surface changes.

## Verification Signals

- `npm test`
- `npm run test:package`
- `git diff --check`
- Optional only for whole-plan execution closeout: record verification-plane evidence and run `node scripts/runtime-state.mjs assess-completion --json`.

## Handoff Notes

This phase establishes source readiness. If the user later asks for commit, push, or live local account-root sync, run that as a separate closeout flow and verify installed files independently.
