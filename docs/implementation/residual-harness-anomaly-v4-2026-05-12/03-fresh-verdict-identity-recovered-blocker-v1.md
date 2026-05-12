# Phase 03: Fresh Verdict Identity And Recovered Blocker Semantics (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | Fresh Verdict Identity | Completion verdict must match `runLeaseId`; repair evidence uses `repairRunId` only. | Split identity paths and reject cross-substitution. |
| REQ-3.2 | Common identity | Verdict identity includes phase number, active phase doc, plan dir, master plan, status file, QA-recorded verdict path. | Extend identity comparison and fixture coverage. |
| REQ-3.3 | Recovered blocker | `lastOutcome=blocked` cannot become `clean_complete` without recovered blockers. | Route recovered blocker to `success_with_warning`; unrecovered remains blocked. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-06 | REQ-3.1 | Completion rejects `repairRunId` in place of `runLeaseId`; repair rejects `runLeaseId` in place of `repairRunId`. |
| AC-07 | REQ-3.2 | Verdict path/identity mismatch fails even when timestamp is fresh. |
| AC-08 | REQ-3.3 | Blocked attempt with `recoveredBlockers[]` closes as `success_with_warning`; without it remains blocked. |

## Goal
- Prevent stale or repair-only verdicts from satisfying ordinary phase completion.

## Expected Outcome
- Freshness is identity-bound, not timestamp-bound.
- Recovered blockers are preserved as warnings and cannot be erased into `clean_complete`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01-completion-owner-zero-attempt-guard-v1"
    - "02-structured-plan-conformance-artifact-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/write-verification-verdict.test.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/scripts/lib/final-outcome-projection.test.mjs"
  readOnlyPaths:
    - "docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md"
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/02-structured-plan-conformance-artifact-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - Add `repairRunId` as a separate identity mode.
  - Require `runLeaseId` for normal completion verdict freshness.
  - Require QA-recorded verdict file path to match current identity.
  - Preserve recovered blocker evidence.
- Out of scope:
  - Running repair apply.
  - Expanding canonical final verdicts beyond `success | success_with_warning`.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Current verdict writer/test fixtures.
  - Phase 02 conformance artifact path/hash contract.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Split identity paths | 1) Add explicit normal completion identity. 2) Add explicit repair identity. 3) Reject mixed `runLeaseId`/`repairRunId`. | Cross-substitution fixtures fail. |
| P03-2 | Add QA path identity | 1) Extract QA-recorded verdict file path. 2) Compare with actual verdict path. 3) Fail mismatch even with fresh timestamp. | QA path mismatch fixture fails. |
| P03-3 | Add common identity checks | 1) Compare phase number. 2) Compare active phase doc, plan dir, master plan, status file. 3) Include conformance artifact path/hash from Phase 02. | Identity mismatch failure names the mismatched field. |
| P03-4 | Preserve recovered blockers | 1) Add blocked-lastOutcome fixture. 2) Require `recoveredBlockers[]` to complete as warning. 3) Keep unrecovered blocked state non-complete. | Recovered blocker becomes `success_with_warning`; unrecovered stays blocked. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A repair verdict cannot masquerade as normal completion. | `node --test .claude/scripts/verification-verdict-state.mjs .claude/scripts/verify-phase-closeout.test.mjs` | `repairRunId` rejected for normal completion. | `.claude/verification-results-residual-harness-v4-phase03.log` |
| SCN-03-2 | A normal run lease cannot authorize repair apply. | `node --test .claude/scripts/write-verification-verdict.test.mjs` | `runLeaseId` rejected in repair identity mode. | `.claude/verification-results-residual-harness-v4-phase03.log` |
| SCN-03-3 | A recovered blocker closes with warning, not clean completion. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/final-outcome-projection.test.mjs` | `success_with_warning` and `stopReasonClass=recovered_blocker`. | `.claude/verification-results-residual-harness-v4-phase03.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/write-verification-verdict.py` | `.claude/scripts/write-verification-verdict.test.mjs` | `node --test .claude/scripts/write-verification-verdict.test.mjs` | Mixed identity is rejected. |
| P03-2 | none | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/lib/phase-closeout-verdict.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | QA path mismatch fails. |
| P03-3 | none | `.claude/scripts/verification-verdict-state.mjs` | `.claude/scripts/verification-verdict-state.mjs` | `node .claude/scripts/verification-verdict-state.mjs self-test` | Identity mismatch names field. |
| P03-4 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/lib/final-outcome-projection.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs`, `.claude/scripts/lib/final-outcome-projection.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/final-outcome-projection.test.mjs` | Recovered blocker warning path passes. |

## Blockers And Review
- Blocker condition: existing verdict schema cannot carry both normal and repair identities without ambiguity.
- First review checkpoint: identity schema and failure reasons before finalizer changes.
- Re-review trigger: accepting timestamp-only freshness.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase03.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/write-verification-verdict.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Unit: `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/final-outcome-projection.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Mixed identity rejection logs.
- QA-recorded verdict path mismatch log.
- Recovered blocker warning fixture.

## Deliverables
- Fresh verdict identity guard.
- Recovered blocker completion semantics.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 06 must reuse `repairRunId` validation instead of inventing a second repair identity shape.

