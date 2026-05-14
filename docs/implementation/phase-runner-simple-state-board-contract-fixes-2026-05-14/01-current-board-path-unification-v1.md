# Phase 01: Current Board Path Unification (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | Finding P1 / STATE.md location | Current board must be `.claude/logs/workflow-enforcement/STATE.md`. | Change default state path and tests. |
| REQ-1.2 | Finding P1 / runRoot | `runRoot` must be `.claude/logs/workflow-enforcement/runs/<stateRunId>/`. | Change `resolveRunRoot(...)` and default writer behavior. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | `simple-run-state.test.mjs` proves default `writeState` creates `.claude/logs/workflow-enforcement/STATE.md`. |
| AC-02 | REQ-1.2 | Round-trip test proves the `runRoot` header is `.claude/logs/workflow-enforcement/runs/<stateRunId>`. |

## Goal
Make the global current board path match the v5 public contract so runners, debug tools, and humans have one stable board location.

## Expected Outcome
- New writes use `.claude/logs/workflow-enforcement/STATE.md`.
- `runRoot` remains run-scoped under `.claude/logs/workflow-enforcement/runs/<stateRunId>/`.
- Existing tests and callers no longer depend on `.claude/logs/simple-run-state/<stateRunId>/STATE.md`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - "docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_foundation"
```

## Scope
- In scope:
  - Change default `resolveStatePath(...)` behavior to the global current board.
  - Change default `resolveRunRoot(...)` behavior to the workflow-enforcement `runs/<stateRunId>` root.
  - Keep explicit `statePath` or `runRoot` override behavior for tests and fixtures.
  - Add a bounded backward-read fallback only if existing tests or code need to inspect legacy state fixtures.
- Out of scope:
  - Auto-migrating runtime artifacts.
  - Changing compatibility projection storage paths.
  - Rewriting terminal evidence sources.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Change state path resolution | Update helper defaults and tests. | Default write path is `.claude/logs/workflow-enforcement/STATE.md`. |
| P01-2 | Change runRoot resolution | Update `resolveRunRoot` and state normalization. | Header records `.claude/logs/workflow-enforcement/runs/<stateRunId>`. |
| P01-3 | Audit callers | Check runner, terminal publisher, and tests for stale simple-run-state path assumptions. | No caller constructs `.claude/logs/simple-run-state` as the default source of truth. |
| P01-4 | Add regression fixture | Add test that asserts no new default write creates `.claude/logs/simple-run-state/<id>/STATE.md`. | Test fails on current implementation and passes after fix. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | Current board is visible at the documented global path. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | Test asserts `.claude/logs/workflow-enforcement/STATE.md` exists after default write. | `.claude/scripts/lib/simple-run-state.test.mjs` |
| SCN-01-2 | Run-specific artifacts still have a run-scoped root. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | Header `runRoot` ends with `workflow-enforcement/runs/<stateRunId>`. | `.claude/scripts/lib/simple-run-state.test.mjs` |

## Validation Plan
- `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- `git diff --check`

## Blockers And Review
- Blocker condition: any existing runtime path builder requires run-local `STATE.md` as a canonical source.
- Review checkpoint: path changes are isolated to helper defaults and test fixtures; callers use helper APIs rather than hard-coded paths.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/execution/v1/01-phase-01-current-board-path-unification/QA_REPORT.md`

## Deliverables
- Updated helper path semantics.
- Tests proving global board and workflow-enforcement runRoot.

## Phase Completion Checklist
- [x] Default current board path is `.claude/logs/workflow-enforcement/STATE.md`.
- [x] Default runRoot is `.claude/logs/workflow-enforcement/runs/<stateRunId>`.
- [x] Legacy simple-run-state path is not used for new default writes.
- [x] Helper and terminal publisher tests pass.
