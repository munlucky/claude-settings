# Phase 04: Reconciliation Transaction Resume (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | v4 Reconciliation protocol | Clean-complete recovery starts with `reconciliation-intent.json` and resumes partial attempts. | Add intent and resume/retry logic. |
| REQ-4.2 | v4 Reconciliation protocol | All touched projections and SQLite events share a transaction id and preserve stale history. | Add transaction metadata and history fields. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-07 | REQ-4.1 | `partial-reconciliation-not-success` test proves partial reconciliation is not success and next run resumes. |
| AC-08 | REQ-4.2 | Tests prove projections and SQLite events share one `transactionId` and stale history is preserved. |

## Goal
- Turn clean-complete recovery into a resumable transaction.

## Expected Outcome
- Partial reconciliation cannot be mistaken for success and can be retried from intent.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "02"
    - "03"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.test.mjs"
    - ".claude/scripts/phase-closeout-reconciler.mjs"
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/runtime-state.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-attempt-manifest.mjs"
    - ".claude/logs/workflow-enforcement/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_transaction"
```

## Scope
- In scope:
  - Write `reconciliation-intent.json` before projection or SQLite mutation.
  - Apply the same `transactionId` to every touched projection and SQLite event.
  - Preserve stale history fields: `originalStopReasonCode`, `originalStopReasonDetail`, `supersededByTransactionId`, `reconciledAt`, `reconciliationReason`, `historicalWarnings`.
  - Treat partial reconciliation as retryable, not success.
  - Resume/retry from intent on the next run.
- Out of scope:
  - Manual orphan adoption UX beyond Phase 03 metadata.
  - Runtime pointer preparation for this plan package.

## Preconditions and Inputs
- Phase 02 completion gate exists.
- Phase 03 manual reconcile boundary exists.

## Reconciliation Intent Schema
```yaml
reconciliationIntent:
  schemaVersion: 1
  path:
    convention: "<executionRoot>/<phaseSlug>/reconciliation-intent.json"
    example: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/04-reconciliation-transaction-resume/reconciliation-intent.json"
  requiredFields:
    transactionId: "stable transaction id reused across retries"
    phaseNumber: "numeric phase number"
    phaseSlug: "phase execution slug"
    createdAt: "ISO-8601 timestamp"
    reconciliationReason: "human-readable reason"
    originalStopReasonCode: "pre-reconciliation stop reason code"
    originalStopReasonDetail: "pre-reconciliation stop reason detail"
    touchedProjectionPaths:
      type: "array"
      minItems: 1
    sqliteEventTargets:
      type: "array"
      minItems: 1
    status: "pending | partial | success | failed"
    partialMarkerPath: "<executionRoot>/<phaseSlug>/reconciliation-partial.json"
    successMarkerPath: "<executionRoot>/<phaseSlug>/reconciliation-success.json"
  optionalFields:
    supersededByTransactionId: "newer transaction id when this intent is superseded"
    historicalWarnings:
      type: "array"
```

Transaction and resume rules:
- The first intent write allocates `transactionId`; every retry must reuse that id until `successMarkerPath` exists.
- Projection writes and SQLite events must include the same `transactionId` from the intent.
- A partial mutation must write `reconciliation-partial.json` with `transactionId`, completed steps, pending steps, and last error.
- A successful run must atomically write `reconciliation-success.json` with `transactionId`, `reconciledAt`, touched paths, and final verifier result.
- If `reconciliation-intent.json` exists without success marker, the next run resumes from the intent and does not allocate a new transaction id.
- Resume is idempotent: already stamped projection paths and SQLite events with the same `transactionId` are skipped or verified, not duplicated.
- Partial status is never displayed as `success`, `clean_complete`, or phase `completed`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add reconciliation intent | 1) Define `<executionRoot>/<phaseSlug>/reconciliation-intent.json`. 2) Write before mutations. 3) Include affected phase/projection list and SQLite event targets. | No mutation happens without intent. |
| P04-2 | Add transaction application | 1) Allocate `transactionId`. 2) Stamp projections. 3) Stamp SQLite events. | All touched surfaces share one transaction id. |
| P04-3 | Add stale history preservation | 1) Copy original stop reason fields. 2) Add supersede and warning fields. | Historical reason is readable after reconciliation. |
| P04-4 | Add resume/retry behavior | 1) Detect unfinished intent. 2) Reuse `transactionId`. 3) Resume idempotently. 4) Write partial/success markers. 5) Keep partial status non-success. | Next run resumes rather than reports clean completion. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | A crash after intent does not look successful. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs` | `partial-reconciliation-not-success` passes. | `.claude/scripts/agent-loop-phase-state.test.mjs` |
| SCN-04-2 | Retry uses the same reconciliation intent. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs` | resume fixture reaches terminal reconciled state. | `.claude/scripts/agent-loop-phase-state.test.mjs` |
| SCN-04-3 | Original blocker/stop detail is preserved. | `node --test .claude/scripts/runtime-state.test.mjs` | stale history fields remain present. | `.claude/scripts/runtime-state.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | none | `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/phase-closeout-reconciler.mjs` | `.claude/scripts/agent-loop-phase-state.test.mjs` | `node --test .claude/scripts/agent-loop-phase-state.test.mjs` | exit 0 |
| P04-2 | none | `.claude/scripts/runtime-state.mjs`, `.claude/scripts/lib/phase-run-lease-store.mjs` | `.claude/scripts/runtime-state.test.mjs` | `node --test .claude/scripts/runtime-state.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: SQLite event writer cannot accept transaction metadata without unsafe migration.
- First review checkpoint: intent schema before mutation wiring.
- Re-review trigger: any partial intent is displayed as `success` or `clean_complete`.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/04-reconciliation-transaction-resume/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/agent-loop-phase-state.test.mjs`
- [ ] `node --test .claude/scripts/runtime-state.test.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-state.mjs`
- [ ] `node --check .claude/scripts/runtime-state.mjs`

## Deliverables
- `reconciliation-intent.json` contract.
- Transaction id propagation.
- Partial reconciliation resume/retry behavior.

## Phase Completion Checklist
- [ ] Reconciliation intent is written before mutation.
- [ ] Partial reconciliation is not success.
- [ ] Retry resumes from intent.
- [ ] Stale history fields are preserved.

## Handoff Notes
- Phase 05 liveness classification can now depend on durable transaction and attempt identity.
