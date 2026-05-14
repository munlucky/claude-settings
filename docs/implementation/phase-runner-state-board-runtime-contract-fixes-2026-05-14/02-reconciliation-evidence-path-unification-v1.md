# Phase 02: Reconciliation Evidence Path Unification (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | Review P1 evidence path mismatch | Runner and publisher must use the same evidence path. | Unify lookup/writes for manifest and blocker evidence. |
| REQ-2.2 | v5 reconciliation contract | Same-attempt blocked resume requires explicit intent and matching evidence. | Test production publisher output as the evidence source. |

## Goal
- Make same-attempt `blocked -> active` reconciliation use the actual terminal publisher evidence, not a test-only runRoot fixture.

## Expected Outcome
- Selected contract: terminal publisher preserves execution sidecar canonical evidence and also mirrors the reconciliation guard inputs required by `validateReconciliationIntent(...)` into `runRoot`.
- Mirror paths:
  - `.claude/logs/workflow-enforcement/runs/<stateRunId>/BLOCKER_EVIDENCE.jsonl`
  - `.claude/logs/workflow-enforcement/runs/<stateRunId>/projection-manifest.json`
- The runRoot mirror is only a transition guard input for same-attempt resume. It does not replace finalizer/verifier canonical evidence in the execution sidecar/manifest chain.
- Tests prove a blocked state produced by production publisher can be resumed only with a matching run-scoped reconciliation intent.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential-runtime-state"
  dependsOn:
    - "01-terminal-blocked-board-publish-wiring-v1.md"
  conflictsWith:
    - "03-active-transition-projection-commit-semantics-v1.md"
    - "04-board-projection-invariant-coverage-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.test.mjs"
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-execution-paths.mjs"
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_state_patch"
```

## Scope
- In scope:
  - Define one evidence location contract for reconciliation.
  - Keep canonical closeout evidence as sidecar/manifest, not `STATE.md`.
  - Support global reconciliation intent alias only with matching `stateRunId`.
- Out of scope:
  - Manual reconciliation UI.
  - Automatic pending recovery.

## Preconditions and Inputs
- Phase 01 terminal publisher integration is complete or the implementation branch includes equivalent production publisher wiring.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Implement runRoot mirror contract | Make terminal publisher mirror the exact reconciliation fields required by `validateReconciliationIntent(...)` into `runRoot` while preserving execution sidecar canonical evidence. | Both mirror files exist under `.claude/logs/workflow-enforcement/runs/<stateRunId>/` after production terminal publish. |
| P02-2 | Keep runner lookup on runRoot mirror | Keep `resolveRunnerReconciliationIntentOptions(...)` reading the runRoot mirror and remove tests that handcraft mirror-only evidence without publisher output. | Same transaction id, blocker evidence id, and manifest sha from publisher output are visible to `validateReconciliationIntent(...)`. |
| P02-3 | Production-path positive test | Publish terminal blocked outcome, write run-scoped reconciliation intent, then assert same-attempt spawn guard allows resume. | Test uses publisher output, not handcrafted runRoot manifest. |
| P02-4 | Negative tests | Cover wrong `stateRunId`, wrong `transactionId`, wrong `blockerEvidenceId`, wrong manifest sha, and missing `--resume`. | All unsafe resumes are rejected. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | An operator can intentionally resume a blocked attempt only after machine-checkable resolution evidence exists. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | production-publisher reconciliation fixture passes | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-02-2 | A stale or mismatched global reconciliation alias cannot revive another run. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | mismatch cases throw | `.claude/scripts/lib/simple-run-state.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | exit 0 |
| P02-2 | none | `.claude/scripts/lib/simple-run-state.mjs` if API options need path support | `.claude/scripts/lib/simple-run-state.test.mjs` | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: terminal publisher cannot determine `stateRunId` or `runRoot` at blocked closeout time.
- First review checkpoint: after the production-path positive test is written.
- Re-review trigger: any approach that validates mtime, free-form reason, or raw file hash instead of manifest identity fields.
- Verification evidence path: `docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/execution/02-reconciliation-evidence-path-unification-v1/QA_REPORT.md`.

## Evidence Contract
```yaml
reconciliationEvidenceContract:
  selectedStrategy: "publisher_runRoot_mirror"
  canonicalEvidence:
    role: "finalizer/verifier evidence"
    location: "existing execution sidecar and projection manifest paths"
    preserved: true
  guardInputMirror:
    role: "same-attempt blocked resume guard input"
    runRoot: ".claude/logs/workflow-enforcement/runs/<stateRunId>/"
    files:
      blockerEvidence: ".claude/logs/workflow-enforcement/runs/<stateRunId>/BLOCKER_EVIDENCE.jsonl"
      projectionManifest: ".claude/logs/workflow-enforcement/runs/<stateRunId>/projection-manifest.json"
    requiredFields:
      - "stateRunId"
      - "attemptId"
      - "transactionId"
      - "blockerEvidenceId"
      - "projectionManifestSha256"
  runnerLookup:
    function: "resolveRunnerReconciliationIntentOptions(...)"
    source: "guardInputMirror"
  disallowedEvidence:
    - "mtime"
    - "free-form reason"
    - "raw file hash without manifest identity fields"
```

## Validation Plan
- [ ] Behavior checks: `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] Helper checks: `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- [ ] Publisher checks: `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`

## Evidence to Mark Done
- Test logs for positive and negative reconciliation fixtures.
- Code review note confirming no free-form reconciliation evidence is accepted.

## Deliverables
- Unified reconciliation evidence path.
- Tests proving production publisher output can be consumed by runner reconciliation.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 04 should add invariant checks using the final path contract.
