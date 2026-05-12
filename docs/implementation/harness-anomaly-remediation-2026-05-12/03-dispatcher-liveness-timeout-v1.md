# Phase 03: Dispatcher Liveness And Timeout Classification (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | User plan / Dispatcher liveness | Dispatcher records child PID, last heartbeat, last log timestamp, and phase number. | Extend dispatcher runtime state and debug/latest-dispatch payload. |
| REQ-3.2 | User plan / Timeout classification | Stale/no-progress before tool timeout and post-timeout child state must be classified distinctly. | Add `stale_child_no_progress`, `child_exited_without_closeout`, `child_still_running`. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-06 | REQ-3.1 | Fixture/latest dispatch JSON contains PID, phase number, heartbeat timestamp, and log timestamp. |
| AC-07 | REQ-3.2 | Tests distinguish stale child, exited child without closeout, and still-running child. |

## Goal
- Make delegated child liveness observable before the outer tool timeout hides the real stop reason.

## Expected Outcome
- Dispatcher can stop stale/no-progress runs before one-hour tool timeout.
- Timeout closeout tells the operator whether the child exited, is still alive, or simply stopped producing progress.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-verifier-environment-parent-reverify-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/verify-phase-closeout-fixtures.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/lib/phase-run-lease-status.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Add child PID, phase number, last heartbeat, and last log timestamp to dispatcher liveness records.
  - Add configurable stale/no-progress threshold below the outer timeout.
  - Emit handoff/diagnostic on stale child stop.
  - Classify post-timeout child state by PID presence/aliveness.
- Out of scope:
  - Replacing delegated-terminal execution mode.
  - Changing runtime lease storage schema beyond optional liveness fields.
  - Automatic process termination policy beyond existing `killStale` semantics.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - `moonshot-phase-dispatch.mjs` has `runtimeState.childPid`.
  - `agent-loop-phase-runtime.mjs` already writes heartbeat while child runs.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Record liveness fields | 1) Track phase number and child PID at spawn. 2) Read/update heartbeat and log timestamp. 3) Persist into debug/latest dispatch payload. | Latest dispatch contains all liveness fields. |
| P03-2 | Add stale/no-progress guard | 1) Define stale threshold env/default. 2) Compare current time with heartbeat/log timestamps. 3) Stop with `stale_child_no_progress` before outer timeout. | Test fixture triggers stale stop without waiting for tool timeout. |
| P03-3 | Split timeout outcomes | 1) On timeout, check child PID. 2) If missing/exited, record `child_exited_without_closeout`. 3) If alive, record `child_still_running`. | Timeout fixtures produce distinct reason codes. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | Dispatcher status shows which phase and child process is alive or stale. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/lib/failure-classifier.test.mjs` | Liveness fixture includes `childPid`, `phaseNumber`, `lastHeartbeatAt`, `lastLogAt`. | `.claude/verification-results-harness-anomaly-phase03.log` |
| SCN-03-2 | A no-progress child stops with `stale_child_no_progress` before outer timeout. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Fixture stop reason is `stale_child_no_progress`. | `.claude/verification-results-harness-anomaly-phase03.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-runtime.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: timeout context lacks liveness fields. After: fields present. |
| P03-2 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: no-progress waits for outer timeout. After: stale stop reason. |
| P03-3 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Before: timeout reason ambiguous. After: child state split. |

## Blockers And Review
- Blocker condition: liveness cannot be read without racing on files or platform-specific PID checks.
- First review checkpoint: liveness payload shape is stable and does not leak prompt text.
- Re-review trigger: adding new long-running supervisor process or changing `killStale` defaults.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase03.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Integration: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`

## Evidence to Mark Done
- Liveness fixture JSON or closeout test output.
- Timeout classification tests for all three reason codes.
- Changed file list limited to owned paths.

## Deliverables
- Dispatcher liveness fields and stale/no-progress stop reason.
- Timeout reason split for post-timeout PID state.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Replay fixtures for session `019e1773` should use reduced deterministic liveness data, not live process timing.
