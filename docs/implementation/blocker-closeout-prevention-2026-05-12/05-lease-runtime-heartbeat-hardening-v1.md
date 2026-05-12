# Phase 05: Lease And Runtime Heartbeat Hardening (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-6.1 | v8 Lease Runtime | Lease mirror and runtime heartbeat never overwrite terminal completion status or blocker metadata. | Harden `phase-run-lease-store` and `runtime-state`. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-09 | REQ-6.1 | Unit tests prove terminal `completion_status` and blocker fields survive heartbeat and active mirror updates. |

## Goal
- Remove the remaining heartbeat contamination path outside the lifecycle writer.

## Expected Outcome
- DB lease heartbeat and current-run mirror cannot turn terminal blocked metadata into active/running/failed noise.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "03"
    - "04"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/runtime-state.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/phase-run-lease-status.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
  sharedMutablePaths:
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_runtime_state"
```

## Scope
- In scope:
  - Prevent `heartbeatLease()` from overwriting terminal `completion_status`.
  - Store terminal heartbeat side data in event JSON payload for first implementation.
  - Prevent active lease mirror deletion loop when existing or incoming payload is terminal.
  - Preserve `attemptOutcome`, `blockingStopReasonCode`, `stopReasonDetail`, `blockerEvidenceRef`, `transactionId`.
- Out of scope:
  - SQLite schema migration unless tests prove event payload storage is insufficient.

## Preconditions and Inputs
- Phase 04 publisher defines terminal field shape.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Harden runtime heartbeat | 1) Detect terminal lease. 2) Skip `completion_status` overwrite. 3) Record liveness/process metadata in event payload. | Terminal lease remains terminal after heartbeat. |
| P05-2 | Harden lease mirror | 1) Add `isTerminalAttempt`. 2) Guard deletion loop. 3) Preserve terminal blocker metadata. | Active mirror cannot delete terminal fields. |
| P05-3 | Add regression tests | 1) Create terminal blocked fixture. 2) Apply heartbeat. 3) Apply active mirror. | Terminal fields remain unchanged. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Runtime heartbeat does not erase terminal blocked completion. | `node --test .claude/scripts/runtime-state.test.mjs` | terminal completion fixture passes. | `.claude/scripts/runtime-state.test.mjs` |
| SCN-05-2 | Current-run mirror keeps blocker detail. | `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs` | terminal mirror fixture passes. | `.claude/scripts/lib/phase-run-lease-status.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | optional `.claude/scripts/runtime-state.test.mjs` if absent | `.claude/scripts/runtime-state.mjs` | runtime-state test | `node --test .claude/scripts/runtime-state.test.mjs` | exit 0 |
| P05-2 | none | `.claude/scripts/lib/phase-run-lease-store.mjs`, related tests | phase lease tests | `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: SQLite helper has no testable in-memory DB path.
- First review checkpoint: before changing DB schema.
- Re-review trigger: any heartbeat code writes `completionStatus` or `completion_status` for terminal attempts.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/05-lease-runtime-heartbeat-hardening/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/runtime-state.test.mjs`
- [ ] `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs`
- [ ] `node --check .claude/scripts/runtime-state.mjs`
- [ ] `node --check .claude/scripts/lib/phase-run-lease-store.mjs`

## Deliverables
- Runtime heartbeat terminal guard.
- Lease mirror deletion guard.

## Phase Completion Checklist
- [ ] Terminal DB lease completion is preserved.
- [ ] Active mirror does not delete blocker metadata.
- [ ] Tests cover heartbeat and mirror contamination paths.

## Handoff Notes
- Phase 07 must include these heartbeat guards in E2E verifier fixtures.
