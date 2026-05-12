# Phase 01: Verifier Environment Blocker And Parent Reverify (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | User plan / Verifier false blocker | `node --test spawn EPERM`, `bash/WSL E_ACCESSDENIED`, `spawnSync git EPERM` inside delegated-terminal are verifier environment failures, not implementation failures. | Add explicit `verification_environment_unavailable` scope and tests in classifier/runtime/verdict handling. |
| REQ-1.2 | User plan / Parent reverify | Parent/current session reverify can move active blocker to historical warning after pass. | Add `parent_reverify_required` state and pass reconciliation rule. |
| REQ-1.3 | User plan / Scorecard blocker split | `scorecard-verdict=blocked` must distinguish implementation blocker and verifier environment blocker. | Add reason-code split in gate classification and scorecard-derived status. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | Unit tests show EPERM/E_ACCESSDENIED verifier failures classify as `verification_environment_unavailable`. |
| AC-02 | REQ-1.2 | Fixture shows parent reverify pass clears active blocker and preserves historical warning. |
| AC-03 | REQ-1.3 | Scorecard blocked reason codes split implementation blocker from verifier environment blocker. |

## Goal
- Separate implementation failure from verifier environment unavailability so a phase does not stay falsely blocked after parent/current reverify passes.

## Expected Outcome
- Runtime state and closeout artifacts can represent:
  - `verification_environment_unavailable`
  - `parent_reverify_required`
  - `parent_reverify_passed`
  - active blocker removed, historical warning retained

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "06-structured-evidence-gate-v1"
  ownedPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.test.mjs"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - "docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Add or normalize the reason code `verification_environment_unavailable`.
  - Detect verifier context for `node --test`, runtime verifier, `bash`/WSL access denied, and verifier-side `git EPERM`.
  - Add `parent_reverify_required` and `parent_reverify_passed` projection support where phase status/root verdict is written.
  - Preserve recovered false blocker as non-blocking historical warning after parent reverify pass.
- Out of scope:
  - Retrying verifier commands automatically inside delegated-terminal.
  - Changing final outcome vocabulary already implemented by `final-outcome-state-model-2026-05-11`.
  - Changing repository closeout behavior.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Current `failure-classifier` already recognizes broad environment blockers.
  - Current `verify-phase-closeout.test.mjs` has a verifier spawn EPERM metadata fixture that must be refined, not deleted.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Add verifier environment taxonomy | 1) Add canonical code and aliases. 2) Ensure delegated-terminal verifier contexts classify to `verification_environment_unavailable`. 3) Keep plain `node_spawn_eperm` for non-verifier node spawn. | Tests distinguish verifier and non-verifier node spawn. |
| P01-2 | Add parent reverify state | 1) Extend phase status/root verdict writer to record `parent_reverify_required`. 2) Add reconciliation path for parent reverify pass. 3) Move blocker to `nonBlockingWarnings[]` or equivalent historical warning field. | Fixture shows no active blocker after parent reverify pass. |
| P01-3 | Split scorecard blocked reason | 1) Route `scorecard-verdict=blocked` with verifier environment metadata to verifier-environment reason. 2) Preserve implementation blockers as active phase blockers. | Scorecard blocked tests show two reason codes. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A verifier EPERM in delegated-terminal does not report implementation failure. | `node --test .claude/scripts/lib/failure-classifier.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | `verification_environment_unavailable` and `parent_reverify_required` assertions pass. | `.claude/verification-results-harness-anomaly-phase01.log` |
| SCN-01-2 | Parent reverify pass leaves a warning only, not an active blocker. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Fixture contains historical warning and closeout is allowed. | `.claude/verification-results-harness-anomaly-phase01.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Before: verifier/non-verifier context may collapse. After: tests pass with canonical reason. |
| P01-2 | none | `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/verification-verdict-state.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: active blocker can remain. After: parent reverify pass clears active blocker. |
| P01-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: `scorecard-verdict=blocked` is ambiguous. After: reason code is explicit. |

## Blockers And Review
- Blocker condition: implementation blockers and verifier environment blockers cannot be distinguished without losing existing blocker metadata.
- First review checkpoint: taxonomy names and phase status fields are stable before touching closeout logic.
- Re-review trigger: any change to final outcome vocabulary or repository closeout semantics.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase01.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Integration smoke: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Test log showing verifier environment classification.
- Fixture output showing parent reverify pass clears active blocker.
- Changed file list limited to owned paths.

## Deliverables
- Updated failure taxonomy and phase status/verdict projection.
- Regression tests for verifier EPERM/E_ACCESSDENIED and parent reverify.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 06 must consume this phase's structured blocker fields instead of parsing Markdown scorecard text.
