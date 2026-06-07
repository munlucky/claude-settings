# Phase 02 - Start Resume Identity Taxonomy

## Goal

Ensure phase start and resume paths always record deterministic runtime-state identity and event taxonomy.

## Dependencies

- Phase 01 authority model.

## Owned Paths

- `scripts/prepare-phase-runner-state.mjs`
- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `tests/runtime-read-model-contract.test.mjs`
- `tests/observability-metrics-contract.test.mjs`

## Read-Only Paths

- live account-root homes
- generated phase status and execution artifacts outside temp test roots

## Required Decisions

- Canonical event types are `phase.start`, `resume.success`, and `resume.failure`.
- Metrics continue to read `resume.success` and `resume.failure`.
- Every start/resume write must include `runId`, `goalId`, `workspaceId`, and plan or phase identity.
- Dry-run preparation must remain non-mutating and must not create a runtime DB.

## Implementation Notes

- `prepare-phase-runner-state.mjs` already records leases and resume snapshots on non-dry-run; add event rows only where missing.
- Resume failure should become a runtime event with enough payload to reconstruct `currentBlocker` and `nextAction`.
- Do not rename canonical metrics events without adding compatibility assertions.

## Acceptance Evidence

- A non-dry-run prepare creates lease, goal, resume snapshot, and `phase.start`.
- Resume success/failure event rows are visible through `status --json`.
- `observability` metrics continue to derive resume success rate from `resume.success` and `resume.failure`.
