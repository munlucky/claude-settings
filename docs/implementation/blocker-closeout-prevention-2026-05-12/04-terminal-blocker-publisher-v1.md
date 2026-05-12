# Phase 04: Terminal Blocker Publisher (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | v8 Lifecycle | Blocked terminal event is `terminal_blocked_published` only. | Publisher uses only that event. |
| REQ-5.1 | v8 Publisher | Publisher is idempotent. | Dedupe sidecar appends by stable record keys. |
| REQ-5.2 | v8 Manifest | Manifest records transaction and file integrity. | Write manifest after projection writes. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-05 | REQ-4.1 | Publisher never emits `lease_blocked`. |
| AC-07 | REQ-5.1 | Retrying same publish does not duplicate `blockerEvidence.id` or `attemptId + transactionId`. |
| AC-08 | REQ-5.2 | Manifest includes transaction id, attempt id, phase number, hashes, record ids, and terminal outcome. |

## Goal
- Add the single shared terminal blocked publish protocol used by runner, dispatcher, and finalizer.

## Expected Outcome
- Terminal blocked outcome can be published repeatedly without duplicating sidecar records or creating untracked projection states.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "03"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-execution-paths.mjs"
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_publisher_contract"
```

## Scope
- In scope:
  - `publishTerminalBlockedOutcome(input)`.
  - Deduped JSONL append.
  - Projection writes using `transactionId`.
  - Manifest commit marker with file hashes and record IDs.
  - Failure-mode metadata for incomplete publish.
- Out of scope:
  - Wiring all callers to publisher.
  - Verifier adoption beyond publisher unit tests.

## Preconditions and Inputs
- Phase 03 attempt-scoped lifecycle guard is complete.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add publisher module | 1) Validate required input. 2) Generate or accept `transactionId`. 3) Use resolver for sidecar paths. | Publisher can create sidecar and manifest in a temp fixture. |
| P04-2 | Add idempotent sidecar append | 1) Read existing sidecars. 2) Dedupe blocker evidence by `id`. 3) Dedupe attempt ledger by `attemptId + transactionId`. | Retry produces no duplicate logical records. |
| P04-3 | Add manifest writer | 1) Hash projection files. 2) Record `blockerEvidenceIds[]`, `attemptLedgerKeys[]`. 3) Write manifest last. | Manifest validates against written files. |
| P04-4 | Add projection write protocol | 1) Use lifecycle writer. 2) Emit `terminal_blocked_published`. 3) Include `attemptId` and `transactionId`. | Projection payloads share transaction ID. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Retrying blocked publish is safe. | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | idempotency fixture passes. | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` |
| SCN-04-2 | Manifest can detect partial publish later. | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | manifest fields include hashes and record IDs. | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `.claude/scripts/lib/terminal-blocker-publisher.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | none | same | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: lifecycle writer cannot accept `terminal_blocked_published` with attempt identity.
- First review checkpoint: before wiring publisher into runner/finalizer.
- Re-review trigger: any second blocked terminal event name appears.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/04-terminal-blocker-publisher/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- [ ] `node --check .claude/scripts/lib/terminal-blocker-publisher.mjs`

## Deliverables
- Idempotent terminal blocker publisher.
- Manifest writer with integrity fields.

## Phase Completion Checklist
- [ ] Publisher uses `terminal_blocked_published` only.
- [ ] Sidecar append is idempotent.
- [ ] Manifest is written last and contains hashes plus record IDs.

## Handoff Notes
- Phase 05 must preserve publisher-produced terminal fields during lease heartbeat and mirror updates.
