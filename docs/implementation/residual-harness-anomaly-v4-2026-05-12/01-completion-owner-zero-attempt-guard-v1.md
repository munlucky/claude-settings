# Phase 01: Completion Owner And Zero Attempt Guard (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | Completion Gate Owner | Only `phase-closeout-finalize.mjs` may promote `completed/clean_complete`. | Remove promotion authority from reconciliation paths and codify finalizer ownership. |
| REQ-1.2 | Reconciler no promotion | `attempts.total=0` must not become completed automatically. | Convert missing attempt evidence to `blocked:missing-phase-attempt-evidence`. |
| REQ-1.3 | Verifier strict completed metadata | Completed phase requires attempt count, terminal attempt outcome/stage, fresh verdict, and conformance pass. | Add verifier assertions and regression fixtures. |
| REQ-7.1 | Timing warning precision | Timing warning appears only when runner active time exceeds wall clock time. | Preserve bounded timing behavior and add focused regression if missing. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | Tests prove finalizer can promote but reconciler cannot. |
| AC-02 | REQ-1.2 | Zero-attempt completed phase fails or normalizes to `blocked:missing-phase-attempt-evidence`. |
| AC-03 | REQ-1.3 | Completed phase without valid attempts/stage/verdict/conformance fails closeout verification. |
| AC-16 | REQ-7.1 | Timing warning fixture emits only when `runnerActiveSeconds > wallClockSeconds`. |

## Goal
- Make false completed states impossible unless the finalizer has produced the required completion evidence.

## Expected Outcome
- `phase-closeout-finalize.mjs` is the only promotion owner for `completed` and `clean_complete`.
- `agent-loop-phase-state.mjs` reconciliation cannot synthesize completion from missing attempt metadata.
- `verify-phase-closeout.mjs` fails any completed phase that lacks objective attempt and evidence metadata.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.sh"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/verify-phase-closeout-fixtures.mjs"
  readOnlyPaths:
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md"
    - "docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - Define finalizer-only promotion contract.
  - Change reconciliation behavior for completed phases with missing attempt evidence.
  - Add verifier checks for completed phase attempt metadata.
  - Add timing warning regression for `runnerActiveSeconds > wallClockSeconds`.
- Out of scope:
  - Repairing existing Phase 3/4/5 state files.
  - Changing canonical final-complete verdict values.
  - Broad runtime-state schema rewrite.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Current `phase-status.yaml` parser behavior in `agent-loop-phase-state.mjs`.
  - Current closeout verifier fixtures.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Codify finalizer-only promotion | 1) Identify every writer that can set `status: completed` or `lastOutcome: clean_complete`. 2) Keep that write path in finalizer. 3) Make non-finalizer paths emit blocked/in-progress states only. | No non-finalizer reconciliation helper writes `clean_complete`. |
| P01-2 | Block zero-attempt completion | 1) Add fixture with `status: completed`, `attempts.total: 0`. 2) Make reconciliation normalize to `blocked:missing-phase-attempt-evidence` or fail verification. 3) Preserve existing valid completed fixtures. | Zero-attempt completed fixture fails with explicit reason. |
| P01-3 | Enforce completed metadata | 1) Require `attempts.total > 0`. 2) Require `attempts.lastOutcome=completed|verified|clean_complete`. 3) Require `timing.lastStage=finish|handoff` prefix or equivalent terminal stage. | Verifier rejects incomplete completion metadata. |
| P01-4 | Keep timing warning precise | 1) Add fixture where runner active equals wall clock. 2) Add fixture where runner active exceeds wall clock. 3) Assert warning only in the latter. | No warning for equal or smaller active time; warning for greater active time. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A phase with no attempts cannot appear complete to the runner. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | Zero-attempt completed fixture fails; finalizer completion fixture passes. | `.claude/verification-results-residual-harness-v4-phase01.log` |
| SCN-01-2 | Reconciler does not silently upgrade missing metadata. | `node --test .claude/scripts/agent-loop-phase-state.mjs` | Reconciler fixture records `blocked:missing-phase-attempt-evidence`. | `.claude/verification-results-residual-harness-v4-phase01.log` |
| SCN-01-3 | Timing warnings are not noisy. | `node --test .claude/scripts/agent-loop-phase-state.mjs` | Warning appears only for `runnerActiveSeconds > wallClockSeconds`. | `.claude/verification-results-residual-harness-v4-phase01.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Finalizer promotion remains green. |
| P01-2 | none | `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/verify-phase-closeout-fixtures.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Zero-attempt completed fails. |
| P01-3 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Missing outcome/stage/verdict/conformance fails. |
| P01-4 | none | `.claude/scripts/agent-loop-phase-state.mjs` | `.claude/scripts/agent-loop-phase-state.mjs` | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Timing invariant warning is precise. |

## Blockers And Review
- Blocker condition: a legitimate non-finalizer path is still required to set `clean_complete`.
- First review checkpoint: list all completion writers before editing.
- Re-review trigger: any relaxation of `attempts.total > 0` for completed phases.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase01.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Unit: `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] Self-test: `node .claude/scripts/agent-loop-phase-state.mjs self-test`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Test log proving zero-attempt completed failure.
- Changed writer inventory.
- Verifier failure messages include `missing-phase-attempt-evidence`.

## Deliverables
- Finalizer-only completion owner contract in code and tests.
- Zero-attempt completion regression fixture.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 02 should attach conformance artifact checks to the completed metadata verifier introduced here.

