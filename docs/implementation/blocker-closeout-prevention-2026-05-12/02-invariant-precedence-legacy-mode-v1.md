# Phase 02: Invariant Precedence And Legacy Mode (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | v8 State Precedence | Terminal state classification uses `attemptOutcome -> completionStatus -> activeExecutionStatus -> status`. | Update both invariant modules or consolidate root wrapper. |
| REQ-1.2 | v8 Core Contract | Legacy verifier mode is allowed only when sidecar and manifest are absent. | Invariant mode detection uses Phase 01 reader. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-3.1 | Tests prove `status=active + completionStatus=blocked + attemptOutcome=blocked` is blocked terminal. |
| AC-02 | REQ-1.2 | Tests prove sidecar/manifest presence prevents fallback to legacy mode. |

## Goal
- Remove split state classification between root and lib invariant modules.

## Expected Outcome
- All invariant checks classify terminal blocked state consistently and never prefer `status=active` over terminal outcome fields.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/harness-state-invariants.test.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_contract"
```

## Scope
- In scope:
  - Apply the same state precedence to root and lib invariant modules.
  - Prefer consolidating root module into a wrapper if feasible.
  - Add canonical mode detection to invariant evaluation.
  - Detect `manifest_sidecar_missing`, `incomplete_transaction`, and split-brain transaction states.
- Out of scope:
  - Terminal blocker publishing.
  - Artifact rendering.

## Preconditions and Inputs
- Phase 01 sidecar reader exists and exposes mode detection.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Consolidate state classification | 1) Locate root/lib duplicate classifier logic. 2) Move shared precedence to one helper or apply same code to both. | Both modules return the same class for the same payload. |
| P02-2 | Add sidecar canonical mode | 1) Use Phase 01 reader. 2) Fail invariant when manifest-only or incomplete transaction exists. | Legacy mode is only used when both sidecar and manifest are absent. |
| P02-3 | Add regression tests | 1) Add active+blocked fixture. 2) Add manifest-only fixture. 3) Add split transaction fixture. | Tests fail before fix and pass after fix. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | A blocked terminal run cannot appear active only because `status=active`. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs .claude/scripts/harness-state-invariants.test.mjs` | blocked terminal fixture passes. | invariant test files |
| SCN-02-2 | A manifest-only state fails instead of falling back to legacy verifier. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | `manifest_sidecar_missing` fixture fails as expected. | `.claude/scripts/lib/harness-state-invariants.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/harness-state-invariants.mjs`, `.claude/scripts/lib/harness-state-invariants.mjs` | invariant tests | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs .claude/scripts/harness-state-invariants.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: root and lib modules expose incompatible public APIs.
- First review checkpoint: before deleting or wrapping either module.
- Re-review trigger: new status vocabulary is introduced outside this precedence helper.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/02-invariant-precedence-legacy-mode/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- [ ] `node --test .claude/scripts/harness-state-invariants.test.mjs`
- [ ] `node --check .claude/scripts/lib/harness-state-invariants.mjs`
- [ ] `node --check .claude/scripts/harness-state-invariants.mjs`

## Deliverables
- Unified invariant precedence.
- Legacy vs sidecar canonical mode tests.

## Phase Completion Checklist
- [ ] Both invariant modules agree on blocked terminal classification.
- [ ] Sidecar/manifest presence blocks legacy fallback.
- [ ] Split-brain and manifest-only fixtures are covered.

## Handoff Notes
- Phase 03 should use the same terminal state helper when guarding lifecycle patches.
