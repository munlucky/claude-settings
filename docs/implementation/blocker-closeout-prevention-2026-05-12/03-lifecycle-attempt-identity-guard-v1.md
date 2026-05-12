# Phase 03: Lifecycle Attempt Identity Guard (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | v8 Lifecycle | Only `terminal_blocked_published` represents blocked terminal event. | Add allowed event enum. |
| REQ-4.2 | v8 Lifecycle | Attempt-scoped events require `attemptId`; guard and callsite wiring land together. | Update writer and all attempt-scoped callsites in one slice. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-05 | REQ-4.1 | Tests reject blocked terminal event names other than `terminal_blocked_published`. |
| AC-06 | REQ-4.2 | Tests reject attempt-scoped lifecycle events without `attemptId` and existing lease/fallback fixtures still pass. |

## Goal
- Make lifecycle writes attempt-aware without breaking existing non-attempt lease and fallback events.

## Expected Outcome
- Heartbeat and blocked terminal lifecycle patches cannot bypass terminal immutability by omitting `attemptId`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01"
    - "02"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.test.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/harness-state-invariants.mjs"
  sharedMutablePaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "single_slice_callsite_update"
```

## Scope
- In scope:
  - Add `ATTEMPT_SCOPED_EVENTS`.
  - Require `attemptId` only for attempt-scoped events.
  - Preserve existing non-attempt lifecycle fixtures.
  - Add immutability guard for terminal attempt fields.
  - Wire attempt IDs in dispatcher, runner, and finalizer callsites touched by attempt-scoped events.
- Out of scope:
  - Publisher implementation.
  - Runtime DB changes.

## Preconditions and Inputs
- Phase 01 reader and Phase 02 state helper are available.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add attempt-scoped event enum | 1) Define enum. 2) Include `terminal_blocked_published`. 3) Exclude `lease_started`, `lease_heartbeat`, `lease_completed`, `fallback_completed`, `closeout_completed`. | Existing lease tests still pass. |
| P03-2 | Add attemptId validation | 1) Reject attempt-scoped event without `attemptId`. 2) Keep non-attempt events compatible. | Tests cover both branches. |
| P03-3 | Add terminal immutability guard | 1) Detect terminal existing payload. 2) Reject or preserve patches that clear terminal fields. | Heartbeat cannot clear blocker fields. |
| P03-4 | Wire callsites | 1) Dispatcher heartbeat/blocked paths pass attemptId when attempt-scoped. 2) Runner remediation passes parent/current attempt identity. 3) Finalizer blocked callsite passes attemptId when used. | No attempt-scoped callsite omits attemptId. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | Existing lease lifecycle fixtures remain compatible. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | old `lease_*` fixtures pass. | `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` |
| SCN-03-2 | Attempt-scoped heartbeat cannot erase blocked terminal fields. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | immutability guard fixture passes. | `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/lib/lifecycle-projection-writer.mjs`, selected callsites | lifecycle writer test | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | exit 0 |
| P03-2 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/phase-closeout-finalize.mjs` | script syntax | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: callsites cannot supply stable attempt identity without inventing incompatible IDs.
- First review checkpoint: after attempt ID source is selected.
- Re-review trigger: any attempt-scoped lifecycle event is added without tests.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/03-lifecycle-attempt-identity-guard/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- [ ] `node --check .claude/scripts/moonshot-phase-dispatch.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [ ] `node --check .claude/scripts/phase-closeout-finalize.mjs`

## Deliverables
- Attempt-scoped event contract.
- Callsite attempt identity wiring.
- Terminal immutability guard.

## Phase Completion Checklist
- [ ] Existing lifecycle tests remain compatible.
- [ ] Attempt-scoped events require attemptId.
- [ ] Terminal fields cannot be cleared by heartbeat patches.

## Handoff Notes
- Phase 04 must use only `terminal_blocked_published` for blocked terminal publish.
