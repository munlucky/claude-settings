# Phase 07 - Plan Graph Scheduler and Scope Drift v1

## Objective

Convert human-readable plans into executable DAG metadata with dependency, read/write-set, parallelism, and scope-drift enforcement.

## Dependencies

- Phase 03.
- Phase 06.

## Owned Paths

- `schemas/plan-graph.schema.json`
- `scripts/plan-graph-validate.mjs`
- `scripts/lib/plan-graph.mjs`
- `scripts/prepare-phase-runner-state.mjs`
- `skills/moonshot-plan-writer/**`
- `skills/moonshot-phase-runner/**`
- `tests/plan-graph-contract.test.mjs`
- `tests/workflow-e2e-contract.test.mjs`

## Read-only Paths

- Existing plan packages under `docs/implementation/**`
- `docs/public/repository-layout.md`
- `package/package-contract.yaml`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P07-1 | Define executable `plan.yaml` chunk schema and rendered `plan.md` relationship. | Plan graph contract |
| P07-2 | Implement dependency and write-set conflict checks. | Scheduler validation |
| P07-3 | Detect actual changed files outside declared write_set. | Scope drift finding |
| P07-4 | Update plan-writer docs to require per-phase owned paths and verification signals. | Skill/doc contracts |

## Acceptance Criteria

- Parallel execution is allowed only when dependencies are satisfied and write sets do not overlap.
- Actual file drift produces a finding instead of silent completion.
- Existing markdown phase packages continue to validate or have a migration path.
- Existing markdown-only phase packages remain supported until an explicit migration phase is approved; `plan.yaml` is additive in this phase.
- Plan writer cannot produce execution-ready docs with missing dependencies or owned paths.

## Verification Signals

- Plan graph schema tests.
- Phase runner dry-run tests.
- `npm test`

## Review-Improvement Loop

- Review focus: scheduler ambiguity, shared test ownership, compatibility with current docs/implementation packages.
- Re-review trigger: migration behavior touches existing package format.

## Phase 07 Closeout

Status: complete

Implemented:
- Added additive plan graph schema and validator CLI.
- Added plan graph library checks for dependencies, parallel write-set conflicts, markdown-compatible mode, schedulable phases, and scope drift.
- Added regression tests for graph validation, scope drift, markdown-only compatibility, and CLI blocking behavior.
- Updated plan-writer and phase-runner source skills to require read/write-set evidence and prevent inferred parallelism.

Verification:
- `node --test tests\plan-graph-contract.test.mjs tests\workflow-e2e-contract.test.mjs tests\syntax-schema-contract.test.mjs`
- `node --check scripts\plan-graph-validate.mjs; node --check scripts\lib\plan-graph.mjs`
- `node -e "...package test file existence check..."`
