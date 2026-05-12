# Phase 04: Terminal Pointer Migration Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | Terminal Pointer Migration | Terminal workflow JSON adds `completedPhaseNumber` and `nextPhaseNumber`; legacy `activePhaseNumber` migrates from degraded evidence to hard fail. | Add writer and invariant migration stages. |
| REQ-4.2 | Running pointer semantics | Running/prepared `activePhaseNumber` still means current executing phase. | Keep active pointer semantics for non-terminal states. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-09 | REQ-4.1 | Terminal workflow JSON includes `completedPhaseNumber` and `nextPhaseNumber`; legacy field is classified as degraded before hard fail. |
| AC-10 | REQ-4.2 | Running/prepared workflow fixtures still validate against current active phase. |

## Goal
- Remove terminal state ambiguity where `activePhaseNumber` can mean either completed phase or next phase.

## Expected Outcome
- Terminal workflow state has explicit completed and next phase pointers.
- Legacy terminal `activePhaseNumber` has a controlled migration path.
- Running/prepared active pointer behavior remains stable.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-completion-owner-zero-attempt-guard-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.test.mjs"
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/harness-state-invariants.test.mjs"
    - ".claude/scripts/fixtures/harness-state-invariants/"
  readOnlyPaths:
    - "docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/02-pointer-invariant-contract-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Add terminal `completedPhaseNumber` and `nextPhaseNumber` writes.
  - Treat terminal legacy `activePhaseNumber` as degraded evidence during migration stage 2.
  - Define hard-fail fixture for final migration stage.
  - Preserve running/prepared `activePhaseNumber`.
- Out of scope:
  - Removing all legacy fields in the same phase.
  - Changing phase-status root pointer semantics.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
  - `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/02-pointer-invariant-contract-v1.md`
- Required code/data:
  - Existing workflow state fixtures under `.claude/scripts/fixtures/harness-state-invariants/`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add terminal pointers | 1) Update terminal workflow writers. 2) Emit `completedPhaseNumber`. 3) Emit `nextPhaseNumber` when known. | Terminal fixtures contain explicit pointers. |
| P04-2 | Preserve active pointer in running/prepared | 1) Keep active pointer writes for running/prepared. 2) Add regression fixtures. | Running/prepared active phase fixtures pass. |
| P04-3 | Add degraded evidence stage | 1) In invariant verifier, classify terminal legacy `activePhaseNumber` as degraded evidence. 2) Include migration warning. | Stage 2 fixture passes with degraded warning. |
| P04-4 | Define hard fail stage | 1) Add feature flag or migration mode for hard fail. 2) Add fixture where terminal legacy field fails. | Hard-fail mode rejects terminal `activePhaseNumber`. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Terminal closeout clearly reports completed and next phase. | `node --test .claude/scripts/harness-state-invariants.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | Terminal completed fixture includes `completedPhaseNumber` and `nextPhaseNumber`. | `.claude/verification-results-residual-harness-v4-phase04.log` |
| SCN-04-2 | Running/prepared state still points to currently executing phase. | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Active running/prepared fixtures pass. | `.claude/verification-results-residual-harness-v4-phase04.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/lib/phase-run-lease-store.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs`, `.claude/scripts/lib/phase-run-lease-store.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/lib/phase-run-lease-store.test.mjs` | Terminal pointers are emitted. |
| P04-2 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/phase-run-lease.mjs` | `.claude/scripts/moonshot-phase-dispatch.test.mjs` | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | Running/prepared active pointer unchanged. |
| P04-3 | none | `.claude/scripts/harness-state-invariants.mjs`, fixtures | `.claude/scripts/harness-state-invariants.test.mjs` | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Degraded legacy terminal fixture is visible. |
| P04-4 | none | `.claude/scripts/harness-state-invariants.mjs`, fixtures | `.claude/scripts/harness-state-invariants.test.mjs` | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Hard-fail mode rejects terminal legacy field. |

## Blockers And Review
- Blocker condition: existing consumers rely on terminal `activePhaseNumber` as the only completed phase pointer.
- First review checkpoint: current consumer inventory before hard-fail mode.
- Re-review trigger: hard-fail mode enabled before all writers emit new pointers.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase04.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/harness-state-invariants.test.mjs`
- [ ] Unit: `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] Unit: `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Terminal pointer fixtures.
- Running/prepared regression fixtures.
- Migration mode notes in test output.

## Deliverables
- Terminal pointer migration implementation.
- Invariant verifier migration tests.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 05 uses `current-run.json`, `active-phase-run.json`, and `phase-status.activeRunLeaseId` as active-run sources; pointer ambiguity must be reduced first.

