# Phase 04: Closeout Recovery Taxonomy (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | ENG Review / blocker projection taxonomy | Blocker terminal projection must define `completionStatus`, `finalVerdict`, `normalizedRunVerdict`, and warnings relationship. | Define clean, recovered blocker, and unrecovered blocker contracts. |
| REQ-4.2 | ENG Review / canonical final outcome conflict | `normalizedRunVerdict=blocked` must not be used as canonical final-complete output. | Keep unrecovered blocker terminal but outside final-complete projection. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-4.1, REQ-4.2 | Taxonomy table states clean/recovered/unrecovered fields and includes `Unrecovered blocker terminal state is terminal but not final-complete.` |

## Goal
- Make terminal closeout projections precise enough that recovered blockers become warnings, unrecovered blockers remain terminal blockers, and canonical final-complete verdicts remain compatible.

## Expected Outcome
- Future finalizer/reconciler implementation can close clean and recovered phases without misclassifying unrecovered blocker terminal state as canonical complete.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn:
    - "01-lifecycle-projection-writer-contract-v1"
    - "02-pointer-invariant-contract-v1"
  conflictsWith:
    - "02-pointer-invariant-contract-v1"
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/scripts/lib/final-outcome-projection.test.mjs"
    - ".claude/scripts/fixtures/closeout-recovery-taxonomy/"
  readOnlyPaths:
    - "docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md"
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- Define clean final projection.
- Define recovered blocker final projection.
- Define unrecovered blocker terminal state.
- Define relationship between `completionStatus`, `finalVerdict`, `normalizedRunVerdict`, `blockingStopReasonCode`, and `historicalWarnings[]`.
- Define finalizer/reconciler expectations without expanding canonical run verdicts.

## Out of Scope
- Expanding canonical final-complete verdict allowlist beyond `success | success_with_warning`.
- Treating unrecovered blocker as final-complete.
- Parsing blocker truth from free-form Markdown.
- Implementing code changes in this document-writing turn.

## Closeout Taxonomy
| Taxonomy | Terminal | Final-complete | Required Fields | Canonical Run Verdict | Warning/Blocker Handling |
|----------|----------|----------------|-----------------|-----------------------|--------------------------|
| Clean final projection | yes | yes | `completionStatus=completed`, `finalVerdict=complete`, `normalizedRunVerdict=success` | `success` | No active blocker; no required historical warning. |
| Recovered blocker final projection | yes | yes | `completionStatus=completed`, `finalVerdict=complete`, `normalizedRunVerdict=success_with_warning`, `historicalWarnings[]` | `success_with_warning` | Active blocker cleared; recovered blocker retained as historical warning. |
| Unrecovered blocker terminal state | yes | no | `completionStatus=verification_blocked`, `finalVerdict=blocked`, `blockingStopReasonCode=<reason>` | none for final-complete projection | Active blocker remains structured; not projected as canonical complete. |

## Canonical Compatibility Rule
- Canonical final-complete output remains `normalizedRunVerdict=success` or `normalizedRunVerdict=success_with_warning`.
- Unrecovered blocker terminal state must not write `normalizedRunVerdict=blocked` into canonical final-complete projection.
- Unrecovered blocker terminal state is terminal but not final-complete.

## Acceptance Criteria
- AC-04: clean final projection uses `finalVerdict=complete` and `normalizedRunVerdict=success`.
- AC-04: recovered blocker final projection uses `finalVerdict=complete`, `normalizedRunVerdict=success_with_warning`, and `historicalWarnings[]`.
- AC-04: unrecovered blocker terminal state uses `completionStatus=verification_blocked`, `finalVerdict=blocked`, and `blockingStopReasonCode=<reason>`.
- AC-04: unrecovered blocker does not create `normalizedRunVerdict=blocked` canonical complete projection.
- AC-04: `Unrecovered blocker terminal state is terminal but not final-complete.` appears in this phase plan and QA evidence.

## Verification Evidence
| Evidence | Command | Expected Signal | Evidence Path |
|----------|---------|-----------------|---------------|
| Taxonomy present | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/04-closeout-recovery-taxonomy-v1.md -Pattern "Unrecovered blocker terminal state is terminal but not final-complete"` | Required sentence exists. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |
| Future finalizer tests | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/final-outcome-projection.test.mjs` | Clean and recovered final-complete pass; unrecovered blocker is terminal but not final-complete. | `.claude/verification-results-lifecycle-projection-phase04.log` |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add taxonomy fixtures | 1) Create clean fixture. 2) Create recovered blocker fixture. 3) Create unrecovered blocker fixture. | Fixtures encode expected field contracts. |
| P04-2 | Update finalizer projection | 1) Route clean/recovered through canonical final-complete. 2) Route unrecovered blocker to terminal blocker state. | `normalizedRunVerdict=blocked` is never emitted by final-complete projection. |
| P04-3 | Update reconciler expectations | 1) Preserve recovered blocker historical warning. 2) Preserve unrecovered blocker structured stop reason. | Reconciler does not erase active unrecovered blocker. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | A recovered blocker closes as success with warning, not active failure. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | `success_with_warning` with `historicalWarnings[]`. | `.claude/verification-results-lifecycle-projection-phase04.log` |
| SCN-04-2 | An unrecovered blocker stops terminally without pretending to be final-complete. | `node --test .claude/scripts/lib/final-outcome-projection.test.mjs` | No canonical `normalizedRunVerdict=blocked`; blocker reason remains structured. | `.claude/verification-results-lifecycle-projection-phase04.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `.claude/scripts/fixtures/closeout-recovery-taxonomy/*.json` | none | finalizer/final outcome tests | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Fixtures cover all three taxonomy states. |
| P04-2 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/lib/final-outcome-projection.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs`, `.claude/scripts/lib/final-outcome-projection.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/final-outcome-projection.test.mjs` | Unrecovered blocker terminal state is not final-complete. |

## Blockers And Review
- Blocker condition: final-outcome projection requires a new canonical run verdict to represent unrecovered blockers.
- First review checkpoint: taxonomy fixture expectations before finalizer code changes.
- Re-review trigger: any change to canonical final-complete verdict allowlist.
- Verification evidence path: `.claude/verification-results-lifecycle-projection-phase04.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/final-outcome-projection.test.mjs`
- [ ] Unit: `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Taxonomy fixture outputs.
- Test log proving unrecovered blocker is terminal but not final-complete.
- QA evidence containing the exact sentence: `Unrecovered blocker terminal state is terminal but not final-complete.`

## Deliverables
- Closeout taxonomy fixtures and implementation in a later run.
- Finalizer/reconciler behavior aligned with canonical final outcome contract.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Acceptance criteria AC-04 passes.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 02 should treat unrecovered blocker as terminal only when the structured blocker event carries phase identity.

