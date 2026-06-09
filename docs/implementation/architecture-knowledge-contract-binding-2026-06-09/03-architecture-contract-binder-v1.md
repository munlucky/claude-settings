# Phase 03 - Architecture Contract Binder v1

## Objective

Add `scripts/architecture-contract-bind.mjs` to normalize an `ApplicableKnowledgeSlice` into an `ArchitectureContractSlice` that architecture packages, plan writer, orchestrator, and phase runner can consume.

## Dependencies

- Phase 01.
- Phase 02.

## Owned Paths

- `scripts/architecture-contract-bind.mjs`
- `tests/architecture-contract-bind.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/binder/`

## Read-only Paths

- `docs/implementation/current-architecture-2026-06-09/TRACEABILITY_MATRIX.md`
- `docs/implementation/current-architecture-2026-06-09/ADR/`
- `docs/implementation/current-architecture-2026-06-09/PLAN.md`
- `scripts/architecture-artifact-validate.mjs`
- `schemas/architecture/architecture-contract-slice.schema.json`

## Staged Paths

- `schemas/architecture/architecture-contract-slice.schema.json`

## Adoption Targets

- Source checkout only.

## Live Mutation Policy

No live runtime mutation. Binder reads slice and architecture artifact refs, then writes generated `ARCHITECTURE_CONTRACT_SLICE.json` only to the phase execution root or explicit test fixture paths unless a later phase explicitly owns another target path.

## Acceptance Criteria

- CLI accepts `--knowledge-slice`, `--artifact-dir`, optional architecture package paths, and `--json`.
- Output artifact is `ARCHITECTURE_CONTRACT_SLICE`.
- Binder maps selected records into requirements, ASRs, decisions, constraints, enforcement rules, verification signals, and path boundaries.
- Blocking ontology constraints without enforcement rules produce `blocked`.
- Execution handoff without verification signals produces `blocked`.
- Brownfield binding without repository evidence or path boundary evidence produces `blocked`.
- Verified decision conflicts produce `blocked` or explicit conflict warnings depending on severity.
- Owned/read-only/staged path overlap is rejected.
- Raw payload fields remain absent from output.

## Verification Signals

- `node --test tests/architecture-contract-bind.test.mjs`
- Fixture cases for enforcement missing, verification missing, decision conflict, path overlap, Brownfield evidence missing, and raw payload rejection.

## Handoff Notes

The binder should produce stable IDs that later handoff and feedback phases can reference without reloading raw knowledge.
