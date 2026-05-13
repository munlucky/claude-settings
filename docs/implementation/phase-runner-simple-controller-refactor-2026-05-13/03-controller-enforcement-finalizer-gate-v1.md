# Phase 03: Controller Enforcement and Finalizer Gate (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | v13 Enforce controller decision | Replace review/verify/finish/checkpoint failure branches with controller decisions. | Gate failure reroutes through controller output. |
| REQ-3.2 | v13 Finalizer boundary | `clean_finish_candidate` calls finalizer but does not complete by itself. | Preserve finalizer/verifier pass before completed state writes. |
| REQ-4.1 | v13 Finalizer failure adapter | Known finalizer failures map to review/verify/repair/blocked classes. | Add tests around finalizer failure normalization and enforcement. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-06 | REQ-3.1 | Tests prove review/verify/finish/checkpoint failures use controller decisions in enforcement mode. |
| AC-07 | REQ-3.2 | Tests prove `clean_finish_candidate` calls finalizer and completed state writes happen only after finalizer/verifier pass. |
| AC-08 | REQ-4.1 | Tests prove known finalizer failure codes route to `rerun_review`, `rerun_verify`, `repair_required`, or `blocked`; unknown maps to blocked with no retry. |

## Goal
- Make the controller the single decision point for retry/repair/block/finish-candidate outcomes while retaining existing final completion ownership.

## Expected Outcome
- Review, verify, finish, and checkpoint failure paths no longer duplicate decision rules in the runner.
- Finalizer/verifier remains the only authority that can seal completed state.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01"
    - "02"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-loop-controller.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/harness-state-invariants.test.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_behavior_change"
```

## Scope
- In scope:
  - Add enforcement mode for controller decisions after shadow adapter is present.
  - Replace local review/verify/finish/checkpoint failure routing with controller decision consumption.
  - Ensure `rerun_review` is limited to review evidence/remediation rounds and never code-change retries.
  - Ensure code-change retry is `continue_execute`.
  - Route `blocked` and `repair_required` distinctly.
  - Preserve finalizer invocation only for `clean_finish_candidate`.
  - Preserve completed state writes only after finalizer/verifier pass.
- Out of scope:
  - Two-phase finalizer gate.
  - Atomic machine projection publish.
  - Explicit repair CLI.

## Decision Consumption Rules
| Decision | Runner Action |
|----------|---------------|
| `continue_execute` | Prepare next code-change worker attempt subject to existing lease/runner policy. |
| `rerun_review` | Prepare review evidence/remediation round only. |
| `rerun_verify` | Prepare verification rerun/evidence round only. |
| `repair_required` | Stop worker retry and surface state repair requirement. |
| `blocked` | Stop current run with blocker details; do not retry automatically. |
| `clean_finish_candidate` | Call existing finalizer/verifier closeout path; do not mark completed unless it passes. |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Enforce failure decisions | 1) Locate review/verify/finish/checkpoint failure branches. 2) Replace routing decision with controller output. 3) Preserve side effects not related to routing. | Tests prove controller decision drives branch result. |
| P03-2 | Preserve finalizer authority | 1) Route all-pass to `clean_finish_candidate`. 2) Call finalizer. 3) Write completed state only on finalizer/verifier pass. | A failing finalizer after candidate does not complete phase. |
| P03-3 | Add finalizer adapter tests | 1) Cover known codes. 2) Cover `spawn EPERM`. 3) Cover unknown finalizer failure. | Unknown finalizer failure returns blocked/no retry. |
| P03-4 | Regression guard | 1) Run closeout and invariant tests. 2) Add fixture for canonical no-op cannot hide verifier failure. | Existing completion gates remain stricter than controller candidate. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A verifier failure cannot be hidden by a clean no-op finish path. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | verifier failure fixture remains incomplete/blocked. | `.claude/scripts/verify-phase-closeout.test.mjs` |
| SCN-03-2 | `clean_finish_candidate` does not write completed state without finalizer pass. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | finalizer-fail-after-candidate fixture leaves phase incomplete. | runner/finalizer tests |
| SCN-03-3 | `rerun_review` is not used for required code changes. | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs .claude/scripts/agent-loop-phase-runner.test.mjs` | code-change review failure routes to `continue_execute`. | controller/runner tests |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | optional runner fixtures | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | enforcement fixtures pass |
| P03-2 | optional finalizer fixtures | `.claude/scripts/phase-closeout-finalize.mjs` only if adapter needs finalizer result shape support | `.claude/scripts/phase-closeout-finalize.test.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | completed write remains verifier/finalizer gated |
| P03-3 | none | none | broad closeout tests | `node --test .claude/scripts/harness-state-invariants.test.mjs` | no invalid state combination passes |

## Blockers And Review
- Blocker condition: enforcement would require changing public CLI or phase status schema.
- Review checkpoint: finalizer boundary must be reviewed before merging enforcement.
- Verification evidence path: `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/03-controller-enforcement-finalizer-gate/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `node --test .claude/scripts/harness-state-invariants.test.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`

## Deliverables
- Controller-enforced failure routing.
- Finalizer-gated `clean_finish_candidate` handling.
- Regression tests for blocked/repair/retry boundaries.

## Phase Completion Checklist
- [ ] Controller decision drives review/verify/finish/checkpoint failure paths.
- [ ] `clean_finish_candidate` cannot mark completion alone.
- [ ] Existing completed state write path remains finalizer/verifier gated.
- [ ] Unknown finalizer failure is blocked with `retryRecommended: false`.

## Handoff Notes
- Phase 04 should create remediation packets from controller output only after this enforcement path exists.
