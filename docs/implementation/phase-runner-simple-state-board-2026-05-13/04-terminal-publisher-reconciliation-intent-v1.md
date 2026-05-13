# Phase 04: Terminal Publisher and Reconciliation Intent (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | v5 / terminal publish transition | Wrap terminal blocked publication in one pending/commit state transition. | Modify terminal blocker publisher and tests. |
| REQ-4.2 | v5 / reconciliation intent | Require run-scoped machine-checkable reconciliation intent for same-attempt blocked resume. | Add helper validation and fixtures. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-08 | REQ-4.1 | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` proves terminal publish commits only after sidecar, manifest, and projections succeed. |
| AC-09 | REQ-4.2 | `node --test .claude/scripts/lib/simple-run-state.test.mjs` proves reconciliation intent positive/negative and global mismatch cases. |

## Goal
- Make terminal blocked publication transaction-shaped at the file contract level while retaining sidecar/manifest as canonical evidence.

## Expected Outcome
- Terminal blocker publisher opens one `withStateTransition(...)` around the whole publish operation.
- Projection failure leaves `STATE.md.projectionStatus=pending`.
- Reconciliation intent is read primarily from `runs/<stateRunId>/reconciliation-intent.json`.
- Global reconciliation intent is accepted only as compatibility alias with matching `stateRunId`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01-simple-run-state-helper-v1"
    - "03-projection-scrub-lease-heartbeat-guard-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.test.mjs"
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/blocker-closeout-prevention.e2e.test.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_terminal_publish"
```

## Scope
- In scope:
  - Refactor `publishTerminalBlockedOutcome(...)` so sidecar append, projection writes, and manifest write happen inside one transition wrapper.
  - Preserve idempotency by `blockerEvidence.id` and `attemptId + transactionId`.
  - Add test hook for projection failure that leaves pending state.
  - Add reconciliation intent reader/validator in `simple-run-state.mjs`.
  - Compute `projectionManifestSha256` from the manifest file and compare intent fields.
- Out of scope:
  - Automatic reconciliation repair.
  - Manual CLI to create reconciliation intent.
  - Changing finalizer/verifier canonical readers.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Wrap terminal publish | 1) Build next blocked state. 2) Open `withStateTransition`. 3) Write sidecars, projections, manifest. 4) Commit transition after all writes. | Publisher tests prove committed success and pending failure. |
| P04-2 | Add reconciliation validation | 1) Resolve run-scoped primary path. 2) Optionally read global alias. 3) Reject mismatch. 4) Verify sidecar/manifest identities. | Positive and negative fixtures pass. |
| P04-3 | Preserve canonical evidence boundary | 1) Keep sidecar/manifest as source of truth. 2) Do not make `STATE.md` enough for verifier closeout. | Tests and comments keep verifier path unchanged. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | A terminal blocked publish cannot leave committed board without projections. | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | injected projection failure leaves `projectionStatus=pending`. | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` |
| SCN-04-2 | Same-attempt blocked resume needs exact evidence match. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | mismatched `transactionId`, `blockerEvidenceId`, or `projectionManifestSha256` rejects. | `.claude/scripts/lib/simple-run-state.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | none | `.claude/scripts/lib/terminal-blocker-publisher.mjs` | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | exit 0; transition success/failure fixtures pass |
| P04-2 | none | `.claude/scripts/lib/simple-run-state.mjs` | `.claude/scripts/lib/simple-run-state.test.mjs` | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | exit 0; reconciliation intent fixtures pass |

## Blockers And Review
- Blocker condition: sidecar append and manifest write cannot be made idempotent inside transition without changing manifest semantics; stop and preserve existing sidecar idempotency first.
- Review checkpoint: ensure `STATE.md` is not used as verifier evidence.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-2026-05-13/execution/v1/04-phase-04-terminal-publisher-reconciliation-intent/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- [ ] `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- [ ] `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`

## Deliverables
- Transition-wrapped terminal blocked publisher.
- Run-scoped reconciliation intent validator.
- Partial publish fixture that leaves pending board.

## Phase Completion Checklist
- [ ] Terminal publish commits only after all sidecar/projection/manifest writes succeed.
- [ ] Projection failure leaves pending board.
- [ ] Reconciliation intent requires exact sidecar/manifest identity match.
- [ ] Global intent alias with mismatched `stateRunId` is hard rejected.
