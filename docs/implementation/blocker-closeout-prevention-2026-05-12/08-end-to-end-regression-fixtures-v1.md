# Phase 08: End-To-End Regression Fixtures (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-9.1 | v8 E2E | Regression fixtures cover heartbeat, finalize, remediation, split-brain, and legacy compatibility. | Add full fixture chain and boundary tests. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-12 | REQ-9.1 | E2E tests prove terminal blocker survives publish, heartbeat, finalize, and remediation decision paths. |

## Goal
- Prove the completed implementation closes the original repeated defect class.

## Expected Outcome
- A blocked terminal attempt remains blocked after the known contamination sequence.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-6"
  dependsOn:
    - "02"
    - "03"
    - "04"
    - "05"
    - "06"
    - "07"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/fixtures/blocker-closeout-prevention/**"
    - ".claude/scripts/blocker-closeout-prevention.e2e.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/**"
    - ".claude/scripts/*.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "final_regression_slice"
```

## Scope
- In scope:
  - E2E fixture for `publishTerminalBlockedOutcome -> dispatch heartbeat -> lease heartbeat -> finalize -> remediation decision`.
  - Split-brain fixture where one projection is blocked and others are running.
  - Manifest-only and incomplete transaction fixtures.
  - Legacy completed run without sidecar.
- Out of scope:
  - New production behavior beyond the fixtures.

## Preconditions and Inputs
- Phases 02-07 completed.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P08-1 | Add fixture directory | 1) Create minimal JSON/YAML fixture inputs. 2) Include sidecar/manifest states. | Fixtures are deterministic and do not reference live runtime state. |
| P08-2 | Add E2E test | 1) Publish terminal blocker. 2) Simulate dispatch heartbeat. 3) Simulate lease heartbeat. 4) Run finalize decision. 5) Run remediation decision. | Parent blocker detail and terminal outcome survive. |
| P08-3 | Add split-brain tests | 1) Create mismatched projection transaction IDs. 2) Create manifest-only state. 3) Create sidecar-only state. | Verifier reports expected failure modes. |
| P08-4 | Run full harness regression set | 1) Run targeted tests. 2) Run broader `.claude/scripts/*.test.mjs`. 3) Run workflow enforcement verify. | All pass or documented not-applicable status. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-08-1 | Blocked terminal never becomes running/completed/failed after heartbeat/finalize/remediation. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | terminal outcome preserved. | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |
| SCN-08-2 | Split-brain projection is detected. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | `split_brain_transaction` expected failure. | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |
| SCN-08-3 | Legacy no-sidecar run still works. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | legacy fixture passes. | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P08-1 | `.claude/scripts/fixtures/blocker-closeout-prevention/**`, `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | none | E2E test | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | exit 0 |
| P08-2 | none | none | all script tests | `node --test .claude/scripts/*.test.mjs` | exit 0 |
| P08-3 | none | none | workflow enforcement | `bash .claude/scripts/workflow-enforcement.sh verify` | exit 0 or documented not-applicable |

## Blockers And Review
- Blocker condition: E2E fixture depends on live `.claude/docs/phase-status.yaml` or active runtime logs.
- First review checkpoint: before adding broad regression command to completion evidence.
- Re-review trigger: any fixture passes while terminal blocker detail is missing.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/08-end-to-end-regression-fixtures/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- [ ] `node --test .claude/scripts/*.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `git diff --check`

## Deliverables
- Deterministic E2E fixture set.
- Regression test proving the defect class is closed.
- QA evidence linking all failure modes to expected signals.

## Phase Completion Checklist
- [ ] E2E contamination sequence preserves terminal blocked state.
- [ ] Split-brain and partial publish failure modes are detected.
- [ ] Legacy no-sidecar compatibility is proven.
- [ ] Full script regression set is run or exact skips are documented.

## Handoff Notes
- After Phase 08 passes, update master checklist and consider preparing this package as the active phase runner target only after the user approves pointer changes.
