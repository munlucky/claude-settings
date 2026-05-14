# Phase 03: Reconciliation Resume Runner Wiring (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | Finding P1 / reconciliation | Same-attempt `blocked -> active` reconciliation exists in helper tests but not in runner execution. | Wire validated intent into spawn guard and active transition. |
| REQ-3.2 | Finding P1 / writeState bypass | Active attempt start uses `writeState()` directly instead of `withStateTransition(...)`. | Route meaningful active start through `withStateTransition(...)`. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-05 | REQ-3.1 | `agent-loop-phase-runner.test.mjs` proves same-attempt blocked without valid intent is rejected before `runWorkerPrompt`, and valid intent reaches the active path. |
| AC-06 | REQ-3.2 | Test proves active attempt start writes `pending -> committed` through `withStateTransition(...)` and preserves pending on projection failure. |

## Goal
Make the helper's reconciliation semantics real in the runner path without weakening terminal stickiness for normal retries.

## Expected Outcome
- Same-attempt blocked state still rejects accidental remediation worker recreation.
- Valid run-scoped reconciliation intent can permit same-attempt `blocked -> active`.
- Active attempt state changes use `withStateTransition(...)`.
- Worker spawn is allowed only after the active transition commits.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01-current-board-path-unification-v1.md"
    - "02-dispatch-resume-board-validation-v1.md"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_runner_control"
```

## Scope
- In scope:
  - Pass `reconciliationIntentOptions` from runner startup/spawn guard into `assertCanTransition` or `withStateTransition`.
  - Replace direct active-start `writeState()` with `withStateTransition(...)` for meaningful lifecycle transitions.
  - Ensure active projection writes occur inside the transition unit or are explicitly no-op when no projection mutation is needed.
  - Add tests around `runWorkerPrompt` not being called on rejected same-attempt blocked state.
- Out of scope:
  - Inventing new reconciliation evidence fields.
  - Relaxing sidecar/manifest equality checks.
  - Allowing `complete/cancelled -> active`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Extend spawn guard | Let the guard evaluate valid reconciliation intent before rejecting same-attempt blocked. | No-intent path remains hard reject; valid-intent path is allowed. |
| P03-2 | Change active start write | Replace direct `writeState()` with `withStateTransition(...)`. | Pending is written before projection unit and committed only after success. |
| P03-3 | Add runner tests | Mock `runWorkerPrompt`, valid/invalid intent, and projection failure. | Rejected paths do not call worker; valid path reaches worker after commit. |
| P03-4 | Keep terminal hard stops | Preserve `complete/cancelled -> active` rejection and pending-state rejection. | Existing terminal guard tests continue to pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A blocked same-attempt worker is not recreated by normal retry. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Mocked `runWorkerPrompt` call count is 0. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-03-2 | A validated reconciliation intent can resume the same attempt. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Valid intent commits active state and reaches worker path. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-03-3 | Active start cannot leave committed board after projection failure. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Failure leaves `projectionStatus=pending`. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |

## Validation Plan
- `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- `git diff --check`

## Blockers And Review
- Blocker condition: active attempt projection writes cannot be isolated enough to run inside `withStateTransition(...)`.
- Review checkpoint: reconciliation path is machine-checkable and does not depend on free-form reason text.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/execution/v1/03-phase-03-reconciliation-resume-runner-wiring/QA_REPORT.md`

## Deliverables
- Runner guard reconciliation wiring.
- Active attempt start transition wrapper.
- Tests for rejected retry, valid reconciliation, and pending-on-failure.

## Phase Completion Checklist
- [x] Same-attempt blocked without intent rejects before worker spawn.
- [x] Same-attempt blocked with valid intent can transition active.
- [x] Active start uses `withStateTransition(...)`.
- [x] Projection failure leaves pending and prevents worker spawn.
