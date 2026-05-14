# Phase 03: Active Transition Projection Commit Semantics (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | Review P2 active commit | Active start cannot commit a no-op projection transition. | Make commit semantics truthful. |
| REQ-3.2 | v5 heartbeat/progress split | Heartbeats and progress mirrors must not open transitions. | Preserve mirror-only behavior and tests. |

## Goal
- Ensure `projectionStatus=committed` means the required writes for the lifecycle state transition succeeded.

## Expected Outcome
- Selected contract: active attempt start does not call `withStateTransition(...)`.
- `writeActiveSimpleRunState()` writes the current board directly as `status=active` and `projectionStatus=committed`; this is a board mirror update, not a pending/commit transaction.
- Actual `phase-status.yaml`, `current-run.json`, lease heartbeat, and progress projection writes remain in their existing boundaries and must not be represented as a completed `STATE.md` transition.
- Tests document the selected path and verify terminal preserve guards are not weakened.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential-runtime-state"
  dependsOn:
    - "01-terminal-blocked-board-publish-wiring-v1.md"
  conflictsWith:
    - "02-reconciliation-evidence-path-unification-v1.md"
    - "04-board-projection-invariant-coverage-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_state_patch"
```

## Scope
- In scope:
  - Remove or replace no-op active transition commit.
  - Preserve same-attempt `blocked -> active` guard behavior.
  - Preserve heartbeat/progress mirror no-transition rule.
- Out of scope:
  - Add new public CLI options.
  - Change dispatch lease format beyond necessary active projection payloads.

## Preconditions and Inputs
- Phase 01 terminal blocked board wiring is complete.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Encode selected active board semantics | Treat active start as a direct current-board update, not a transaction, unless a future change wraps real projection writes. | Test names and implementation state that active start avoids `withStateTransition(...)`. |
| P03-2 | Fix `writeActiveSimpleRunState()` | Remove the `() => ({ active: true })` no-op transition and write `STATE.md status=active projectionStatus=committed` directly. | No pending transition or committed no-op transition is created for active start. |
| P03-3 | Preserve retry guard order | Ensure worker spawn guard still runs before any same-attempt retry updates phase state to running. | Existing same-attempt blocked tests continue to pass. |
| P03-4 | Mirror regression tests | Prove lease heartbeat and progress checkpoint do not create pending transitions. | Existing and new mirror tests pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A committed active board is not misleading partial-write evidence. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | active start test asserts `withStateTransition(...)` is not used and no pending transition is opened | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-03-2 | Heartbeats do not open pending board transactions. | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` | heartbeat no-pending fixture passes | `.claude/scripts/lib/phase-run-lease-store.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | exit 0 |
| P03-2 | none | `.claude/scripts/lib/phase-run-lease-store.mjs` only if active projection write is moved there | `.claude/scripts/lib/phase-run-lease-store.test.mjs` | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: direct active board write cannot preserve same-attempt terminal guards without broad refactor.
- First review checkpoint: after removing the no-op `withStateTransition(...)` active start call.
- Re-review trigger: any test that only checks for string presence instead of behavior.
- Verification evidence path: `docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/execution/03-active-transition-projection-commit-semantics-v1/QA_REPORT.md`.

## Active Start Contract
```yaml
activeStartContract:
  selectedStrategy: "direct_committed_board_write"
  forbidden:
    - "withStateTransition(nextActiveState, ..., () => ({ active: true }))"
    - "opening projectionStatus=pending for heartbeat/progress mirrors"
  requiredStateWrite:
    status: "active"
    projectionStatus: "committed"
  projectionWrites:
    phaseStatus: "existing runner updatePhaseState boundary"
    currentRun: "existing lease/projection heartbeat boundary"
    latestDispatch: "existing dispatch/projection boundary"
  guardOrder:
    - "read STATE.md"
    - "reject pending or terminal same-attempt state"
    - "only then write active board directly"
```

## Validation Plan
- [ ] Behavior checks: `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] Lease checks: `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`
- [ ] Regression checks: `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`

## Evidence to Mark Done
- Test output showing no no-op committed transition remains.
- Review note confirming terminal guards remain before worker spawn.

## Deliverables
- Truthful active start transition semantics.
- Regression tests for no-op commit prevention.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 04 should assert pending state only appears for meaningful transitions.
