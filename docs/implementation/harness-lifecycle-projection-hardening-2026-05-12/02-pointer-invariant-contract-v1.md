# Phase 02: Pointer Invariant Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | ENG Review / phase pointer invariant | Running state and terminal state pointer invariants must be separate. | Define state matrix and invariant verifier expectations. |
| REQ-2.2 | User plan / State invariant 계약 | Terminal workflow phase may differ from `phase-status.activePhaseNumber` after closeout. | Accept `completedPhaseNumber` or terminal event `phaseNumber` for terminal projections. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-02 | REQ-2.1, REQ-2.2 | Valid/invalid state matrix shows closeout just completed phase N while active pointer advances to N+1 without mismatch. |

## Goal
- Prevent invariant false positives by making phase pointer checks state-aware.

## Expected Outcome
- `harness-state-invariants` can distinguish active workflow state from terminal workflow evidence without treating normal closeout advancement as corruption.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-lifecycle-projection-writer-contract-v1"
  conflictsWith:
    - "04-closeout-recovery-taxonomy-v1"
  ownedPaths:
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/harness-state-invariants.test.mjs"
    - ".claude/scripts/fixtures/harness-state-invariants/"
  readOnlyPaths:
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- Define running/prepared pointer invariant.
- Define terminal pointer invariant.
- Define valid/invalid fixture matrix for prepared, running, completed, superseded, failed, and blocker terminal states.
- Define how `completedPhaseNumber` and lifecycle terminal event `phaseNumber` are used.

## Out of Scope
- Implementing invariant tests in this document-writing turn.
- Rewriting `phase-status.yaml` preparation behavior.
- Changing phase runner phase selection logic.
- Changing closeout taxonomy beyond consuming Phase 04 terminal status names.

## Pointer Invariant Matrix
| Workflow State Class | Compatible Status Values | Required Phase Pointer Rule | Valid Example | Invalid Example |
|----------------------|--------------------------|-----------------------------|---------------|-----------------|
| Active prepared | `prepared` | workflow phase equals `phase-status.activePhaseNumber`. | `latest-dispatch.phaseNumber=3`, `activePhaseNumber=3`. | `latest-dispatch.phaseNumber=2`, `activePhaseNumber=3`. |
| Active running | `running`, active dispatch evidence | workflow phase equals `phase-status.activePhaseNumber`. | `current-run.phaseNumber=3`, `activePhaseNumber=3`. | `current-run.phaseNumber=2`, `activePhaseNumber=3`. |
| Terminal completed | `completed` | workflow phase equals `completedPhaseNumber` or terminal lifecycle event `phaseNumber`. | phase 2 completed, active pointer moved to phase 3. | completed payload lacks phase identity and does not match any completed phase. |
| Terminal superseded | `superseded`, `superseded-by-local-fallback` | superseded workflow phase equals the superseded dispatch phase or fallback terminal event phase. | dispatch phase 2 superseded by local fallback after phase 2 closeout. | superseded dispatch claims unrelated phase 5 without fallback evidence. |
| Terminal failed | `failed` | failed workflow phase equals failed terminal event phase and does not need to match next active pointer. | phase 2 failed and active pointer remains phase 2 or moves according to recovery policy. | failed event has no phase identity. |
| Terminal blocker | `completed` with blocker completion status or dedicated terminal blocker status | blocker workflow phase equals blocker terminal event phase. | unrecovered phase 2 verification blocker while active pointer may be unset or pending recovery. | blocker payload is inferred only from Markdown text. |

## Acceptance Criteria
- AC-02: `running/prepared` workflow phase must equal `phase-status.activePhaseNumber`.
- AC-02: terminal workflow phase must equal `completedPhaseNumber` or terminal lifecycle event `phaseNumber`.
- AC-02: closeout immediately after phase N with next active pointer N+1 is valid when workflow JSON is terminal for phase N.
- AC-02: missing terminal phase identity remains invalid.

## Verification Evidence
| Evidence | Command | Expected Signal | Evidence Path |
|----------|---------|-----------------|---------------|
| State matrix present | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/02-pointer-invariant-contract-v1.md -Pattern "Pointer Invariant Matrix","phase 2 completed, active pointer moved to phase 3"` | Matrix includes active and terminal examples. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |
| Future invariant tests | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Fixtures for six replay patterns pass. | `.claude/verification-results-lifecycle-projection-phase02.log` |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add state-aware invariant classifier | 1) Classify workflow state as active or terminal. 2) Select pointer rule by state class. | Active mismatch still fails; terminal next-active mismatch does not fail. |
| P02-2 | Add replay fixtures | 1) Add prepared/running valid fixtures. 2) Add completed/superseded/failed/blocker terminal fixtures. | Six fixture cases cover valid and invalid outcomes. |
| P02-3 | Integrate terminal blocker rule | 1) Read terminal event phase identity from structured metadata. 2) Avoid Markdown-only blocker inference. | Blocker terminal fixture passes only with structured phase identity. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | A normal closeout does not report mismatch just because the active pointer moved to the next phase. | `node --test .claude/scripts/harness-state-invariants.test.mjs` | `terminal_completed_next_active_valid` fixture passes. | `.claude/verification-results-lifecycle-projection-phase02.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/harness-state-invariants.mjs` | `.claude/scripts/harness-state-invariants.test.mjs` | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Before: terminal next-active mismatch can fail. After: state-aware rule passes. |
| P02-2 | `.claude/scripts/fixtures/harness-state-invariants/*.json` | `.claude/scripts/harness-state-invariants.test.mjs` | fixture tests | `node --test .claude/scripts/harness-state-invariants.test.mjs` | Fixture matrix covers active and terminal states. |

## Blockers And Review
- Blocker condition: terminal workflow files lack any structured phase identity.
- First review checkpoint: invariant classifier names before fixture expansion.
- Re-review trigger: adding new terminal status values outside Phase 03/04 contracts.
- Verification evidence path: `.claude/verification-results-lifecycle-projection-phase02.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/harness-state-invariants.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Valid/invalid fixture matrix.
- Test log showing closeout next-active mismatch is accepted only for terminal state.
- Changed file list limited to owned paths.

## Deliverables
- State-aware pointer invariant implementation in a later run.
- Replay fixtures for active and terminal workflow state classes.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Acceptance criteria AC-02 passes.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 04 unrecovered blocker terminal state must carry structured phase identity so this phase can validate it without Markdown parsing.

