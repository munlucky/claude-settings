# Phase 04: Board Projection Invariant Coverage (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | Review P2 invariant gap | Invariant checker must read `STATE.md` and compare board/projection state. | Add board snapshot and contradiction rules. |
| REQ-4.2 | Regression suite | Existing state-board protections must continue to pass. | Run focused regression matrix. |

## Goal
- Make `harness-state-invariants` catch the exact state-board/projection contradictions that v5 promised to prevent.

## Expected Outcome
- `evaluateHarnessStateInvariants(...)` includes the current board when `.claude/logs/workflow-enforcement/STATE.md` exists.
- Tests cover:
  - `STATE.md status=blocked` plus projection running: `state-board-blocked-projection-running`.
  - `STATE.md status=complete` plus projection active: `state-board-complete-projection-active`.
  - `STATE.md projectionStatus=pending`: `state-board-pending-transition`.
  - `STATE.md.stateRunId` mismatch with global compatibility projection `stateRunId`: `state-board-projection-run-id-mismatch`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential-runtime-state"
  dependsOn:
    - "01-terminal-blocked-board-publish-wiring-v1.md"
    - "02-reconciliation-evidence-path-unification-v1.md"
    - "03-active-transition-projection-commit-semantics-v1.md"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
    - ".claude/scripts/blocker-closeout-prevention.e2e.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_state_patch"
```

## Scope
- In scope:
  - Add board-aware invariant snapshot fields.
  - Add violation codes for the four contradiction classes.
  - Extend e2e fixture if needed to prove actual blocked loop prevention.
- Out of scope:
  - Dashboard/TUI display.
  - Runtime recovery automation for pending transitions.

## Preconditions and Inputs
- Phases 01 through 03 are complete.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Read current board | Add `STATE.md` parsing through `readState(...)` or equivalent safe parser in invariant snapshot. | Missing board remains non-fatal; malformed/pending board is visible. |
| P04-2 | Add contradiction rules | Compare board status/run id/projection status against workflow projection payloads. | Violations use the stable codes `state-board-blocked-projection-running`, `state-board-complete-projection-active`, `state-board-pending-transition`, and `state-board-projection-run-id-mismatch`, with source file names. |
| P04-3 | Add fixture tests | Create fixtures for blocked/running, complete/active, pending, and run id mismatch. | Tests fail before implementation and pass after. |
| P04-4 | Run focused regression | Execute the full focused command set from the master plan. | All commands exit 0 and `git diff --check` is clean. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Split-brain board/projection state is reported before closeout claims success. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | violation codes for all four contradiction fixtures | `.claude/scripts/lib/harness-state-invariants.test.mjs` |
| SCN-04-2 | A blocked scorecard cannot silently produce another same-attempt remediation worker. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | e2e blocked-loop prevention passes using production paths | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | none | `.claude/scripts/lib/harness-state-invariants.mjs` | `.claude/scripts/lib/harness-state-invariants.test.mjs` | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | before: board contradictions not detected; after: pass |
| P04-2 | optional fixture data only if needed | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | same | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: board/projection mismatch detection requires reading runtime artifacts that tests cannot isolate safely.
- First review checkpoint: after adding the first failing invariant fixture.
- Re-review trigger: any violation rule that treats missing `STATE.md` as fatal for legacy closeout.
- Verification evidence path: `docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/execution/04-board-projection-invariant-coverage-v1/QA_REPORT.md`.

## Required Violation Codes
| Code | Trigger | Minimum Evidence Fields |
|------|---------|-------------------------|
| `state-board-blocked-projection-running` | Board status is `blocked` and any compatibility projection reports `active`, `running`, or `in_progress` for the same `stateRunId`. | board path, projection path, `stateRunId`, board status, projection status |
| `state-board-complete-projection-active` | Board status is `complete` and any compatibility projection reports active/running lifecycle state or stale active fields for the same `stateRunId`. | board path, projection path, `stateRunId`, board status, projection status |
| `state-board-pending-transition` | Board `projectionStatus` is `pending`. | board path, `stateRunId`, `transitionId`, status |
| `state-board-projection-run-id-mismatch` | Board `stateRunId` differs from any global compatibility projection `stateRunId`. | board path, projection path, board `stateRunId`, projection `stateRunId` |

## Validation Plan
- [ ] Invariant checks: `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- [ ] E2E checks: `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- [ ] Full focused regression: command set in `00-master-plan-v1.md`

## Evidence to Mark Done
- Invariant test output with board-aware fixtures.
- E2E output showing blocked loop prevention.
- `git diff --check` output.

## Deliverables
- Board-aware invariant checker.
- Regression tests for board/projection contradictions.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- After this phase, rerun plan closeout review before dispatching implementation.
