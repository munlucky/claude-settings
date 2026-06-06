# Phase 03 - Run Identity, Lease, and Resume Lifecycle v2

## Goal

Support one PC with many projects and many simultaneous runs/goals without identity collision or stale active-run confusion.

## Execution Metadata

- Dependencies: Phase 02.
- Owned paths: `scripts/prepare-phase-runner-state.mjs`, `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs`, `skills/moonshot-phase-runner/SKILL.md`, `skills/moonshot-phase-executor/SKILL.md`, `tests/runtime-control-plane-contract.test.mjs`, `tests/runtime-read-model-contract.test.mjs`, `tests/workflow-e2e-contract.test.mjs`.
- Read-only paths: existing runtime-state DB files and project knowledge state except phase-owned test/temp DBs.
- Adoption targets: source CLI and phase-runner preparation flow.
- Live mutation policy: no live profile mutation; runtime state writes allowed only in explicit non-dry-run or temp test DB contexts.
- Required evidence: duplicate active goal fixture, parallel allowed fixture, stale lease fixture, resume snapshot fixture, `npm test`.
- Conflicts: fixed default run IDs, hidden same-goal parallelism, stale active leases with no recovery event, dry-run writes.
- Staged paths: phase-runner preparation, runtime CLI/store lease logic, workflow tests.
- Closure traceability: duplicate/parallel/stale lease fixture logs and runtime status JSON.

## Required Work

- Generate unique default run IDs instead of fixed phase-runner IDs.
- Accept explicit `--run-id`, `--goal-id`, `--workspace-id`, and `--allow-parallel`.
- Derive workspace ID from path/hash when omitted.
- Add active run lease heartbeat, TTL expiry, stale lease cleanup, and recovery events.
- Define same `projectId + goalId` parallel execution policy.
- Surface active runs, stale leases, current blockers, and next action in `status --json`.

## Acceptance Criteria

- Same project can run different goals concurrently.
- Same project and same goal blocks by default unless `--allow-parallel` is explicit.
- Stale leases are visible and recoverable.
- Resume snapshots are written only for non-dry-run preparation.

## Regression Contract

- Default run IDs are unique.
- Explicit run/goal/workspace IDs are preserved.
- Duplicate active same-goal lease blocks by default.
- `--allow-parallel` permits intentional same-goal parallelism.
- Heartbeat, TTL, stale cleanup, and recovery events are visible in runtime status.

## Completion Evidence

- `npm test`
- Lease lifecycle fixture output
- Runtime status JSON showing active and stale runs
- Non-dry-run resume snapshot record
