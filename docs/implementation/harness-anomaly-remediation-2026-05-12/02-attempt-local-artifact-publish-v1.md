# Phase 02: Attempt-local Artifact Publish And Stale Hash Diagnostics (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | User plan / Artifact publish order | Attempt-local verdict must be created and hashed before canonical/current promotion. | Add attempt-local verdict staging and promote only in closeout publish. |
| REQ-2.2 | User plan / Stale hash recovery | Stale current artifact index diagnostic includes old/new hash, source attempt, and recovery command. | Extend current artifact validation diagnostics and finalizer stale-index handling. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-2.1 | Test proves canonical verdict is not overwritten before successful promotion. |
| AC-05 | REQ-2.2 | Test proves stale hash diagnostic includes old hash, new hash, source attempt, and recovery command. |

## Goal
- Make artifact publish ordering explicit enough that stale hash conflicts cannot contaminate canonical verdict/current index paths.

## Expected Outcome
- Attempt output lives under the phase execution/attempt scope first.
- Canonical verdict and `current-artifacts.json` are updated only in the final publish step.
- Stale index failures return `stale_current_artifact_index` with actionable recovery metadata.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-verifier-environment-parent-reverify-v1"
  conflictsWith:
    - "06-structured-evidence-gate-v1"
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/scripts/lib/current-artifacts-state.test.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.test.mjs"
  readOnlyPaths:
    - "docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md"
    - ".claude/scripts/verification-verdict-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Create attempt-local verdict path convention for closeout publish input.
  - Hash attempt-local verdict before canonical promotion.
  - Promote canonical verdict, immutable manifest, and current pointer atomically at closeout publish.
  - Enrich stale current-artifacts diagnostics.
- Out of scope:
  - Renaming existing canonical verdict paths.
  - Replacing `current-artifacts.json` schema created by the prior invariant plan.
  - Log snapshot behavior not related to stale hash recovery.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
  - `docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md`
- Required code/data:
  - `current-artifacts-state.mjs` already computes raw SHA-256 and reports `artifact_hash_mismatch`.
  - `phase-closeout-finalize.mjs` already builds closeout manifest/current index.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Introduce attempt-local verdict staging | 1) Identify finalizer input point for verdict payload. 2) Write attempt-local verdict under execution/attempt path. 3) Record raw SHA-256 in publish manifest input. | Canonical path remains unchanged until promotion step. |
| P02-2 | Atomic promotion sequencing | 1) Promote canonical verdict. 2) Write immutable manifest. 3) Publish `current-artifacts.json` last. 4) Roll back or stop before current pointer on hash conflict. | Tests assert current pointer is not updated on failed promotion. |
| P02-3 | Stale index diagnostic | 1) Convert artifact hash mismatch to `stale_current_artifact_index` when current index points to stale canonical artifact. 2) Include `oldHash`, `newHash`, `sourceAttempt`, `recoveryCommand`. | Diagnostic is machine-readable and appears in stderr/diagnostics ledger. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | A failed publish cannot overwrite canonical verdict with an unpromoted attempt. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/current-artifacts-state.test.mjs` | Fixture verifies canonical verdict hash unchanged on failed promotion. | `.claude/verification-results-harness-anomaly-phase02.log` |
| SCN-02-2 | Stale current index reports recovery metadata instead of opaque fail. | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | `stale_current_artifact_index` includes old/new hash, source attempt, recovery command. | `.claude/verification-results-harness-anomaly-phase02.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Before: direct canonical write risk. After: attempt-local first. |
| P02-2 | none | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Before: current pointer may advance after partial publish. After: pointer last and atomic. |
| P02-3 | none | `.claude/scripts/lib/current-artifacts-state.mjs`, `.claude/scripts/lib/closeout-diagnostics.mjs` | `.claude/scripts/lib/current-artifacts-state.test.mjs`, `.claude/scripts/lib/closeout-diagnostics.test.mjs` | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs .claude/scripts/lib/closeout-diagnostics.test.mjs` | Before: stale hash detail incomplete. After: diagnostic is actionable. |

## Blockers And Review
- Blocker condition: finalizer cannot determine source attempt path for verdict payload without changing caller contract.
- First review checkpoint: attempt-local path convention and promotion order are approved in tests before modifying diagnostics.
- Re-review trigger: any change to current index schema version or canonical artifact naming.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase02.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/current-artifacts-state.test.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/closeout-diagnostics.test.mjs`
- [ ] Integration smoke: `node --test .claude/scripts/lib/*.test.mjs`

## Evidence to Mark Done
- Test log showing attempt-local publish before canonical promotion.
- Diagnostic fixture showing stale current artifact recovery metadata.
- Changed file list limited to owned paths.

## Deliverables
- Attempt-local verdict publish contract.
- Stale current artifact diagnostic with recovery command.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 06 should treat source attempt and hash fields as structured metadata for closeout evidence.
