# Phase 07: Verifier And Final Outcome Adoption (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.2 | v8 Core Contract | Sidecar/manifest presence disables legacy fallback. | Verifier adopts canonical mode. |
| REQ-5.2 | v8 Manifest | Manifest mismatch and partial publish are failure modes. | Verify manifest/hash/id consistency. |
| REQ-8.1 | v8 Finalizer | Open/regressed blocker or manifest mismatch skips completed reconciliation. | Update verifier, finalizer, final outcome projection. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-02 | REQ-1.2 | Verifier uses legacy mode only when sidecar and manifest are absent. |
| AC-08 | REQ-5.2 | Verifier reports manifest failure modes. |
| AC-11 | REQ-8.1 | Finalizer skips completed/superseded reconciliation when active blocker or incomplete transaction exists. |

## Goal
- Make sidecar and manifest data participate in actual closeout decisions.

## Expected Outcome
- Terminal blocked state cannot be completed away by finalizer or ignored by verifier.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "01"
    - "02"
    - "04"
    - "06"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/scripts/lib/final-outcome-projection.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
  sharedMutablePaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout_contract"
```

## Scope
- In scope:
  - `verify-phase-closeout.mjs` reads sidecar/manifest canonical state.
  - `phase-closeout-finalize.mjs` skips completed reconciliation for active blocker or manifest failure.
  - `lib/final-outcome-projection.mjs` excludes open/regressed blocker from final-complete.
  - Markdown artifacts become consistency inputs only.
- Out of scope:
  - Publisher implementation.
  - Artifact renderer changes already handled by Phase 06.

## Preconditions and Inputs
- Phase 01 reader.
- Phase 02 invariant precedence.
- Phase 04 publisher contract.
- Phase 06 renderer projection.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P07-1 | Adopt sidecar in verifier | 1) Detect mode. 2) In sidecar mode, require manifest consistency. 3) Treat Markdown as projection check only. | Verifier fails sidecar mismatch and passes clean legacy no-sidecar case. |
| P07-2 | Add finalize skip | 1) Check sidecar state before completed reconciliation. 2) Skip for open/regressed blocker or manifest mismatch. 3) Write stale/blocked diagnostic only. | Finalizer never writes completed/superseded over active blocker. |
| P07-3 | Update final outcome projection | 1) Read sidecar summary. 2) Exclude open/regressed blocker from final-complete. 3) Keep historical resolved blocker as warning only. | Open blocker blocks final-complete; resolved blocker does not. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-07-1 | A sidecar open blocker prevents final complete. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/lib/final-outcome-projection.test.mjs` | open blocker fixtures fail final-complete. | verifier/final outcome tests |
| SCN-07-2 | A legacy completed run without sidecar still verifies. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | legacy fixture passes. | `.claude/scripts/verify-phase-closeout.test.mjs` |
| SCN-07-3 | Finalizer does not complete a phase with incomplete transaction. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | skip diagnostic fixture passes. | `.claude/scripts/phase-closeout-finalize.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P07-1 | none | `.claude/scripts/verify-phase-closeout.mjs`, tests | verifier tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |
| P07-2 | none | `.claude/scripts/phase-closeout-finalize.mjs`, tests | finalizer tests | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | exit 0 |
| P07-3 | none | `.claude/scripts/lib/final-outcome-projection.mjs`, tests | projection tests | `node --test .claude/scripts/lib/final-outcome-projection.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: verifier cannot distinguish legacy mode from sidecar canonical mode.
- First review checkpoint: before changing finalizer completed reconciliation.
- Re-review trigger: any path still treats HANDOFF as canonical blocker source.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/07-verifier-final-outcome-adoption/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `node --test .claude/scripts/lib/final-outcome-projection.test.mjs`
- [ ] `node --check .claude/scripts/verify-phase-closeout.mjs`
- [ ] `node --check .claude/scripts/phase-closeout-finalize.mjs`
- [ ] `node --check .claude/scripts/lib/final-outcome-projection.mjs`

## Deliverables
- Verifier sidecar canonical adoption.
- Finalizer skip rules.
- Final outcome sidecar blocker guard.

## Phase Completion Checklist
- [ ] Verifier uses sidecar canonical mode when sidecar or manifest exists.
- [ ] Finalizer skips completed reconciliation for active blockers and manifest mismatch.
- [ ] Final outcome projection does not complete over open/regressed blocker.

## Handoff Notes
- Phase 08 should verify all cross-module behavior together.
