# Phase 03: Dispatch Lifecycle Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | ENG Review / latest-dispatch status schema | Existing `latest-dispatch.status` consumers expect `prepared`, `completed`, `failed`, `superseded`, and `superseded-by-local-fallback`. | Freeze compatible status enum and document `running` only as existing active vocabulary when already supported by consumers. |
| REQ-3.2 | User plan / State detail fields | New dispatch lifecycle events must be separate from `status`. | Define `lifecycleEvent`, `dispatchStage`, `lastLifecycleEventAt`, `lastHeartbeatAt`, and `lastLogAt`. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-03 | REQ-3.1, REQ-3.2 | `preflight_passed`, `dispatch_started`, and `dispatch_failed` appear only as lifecycle events, never as `latest-dispatch.status` values. |

## Goal
- Improve dispatch observability without breaking existing latest-dispatch readers.

## Expected Outcome
- Dispatcher can record fine-grained progress while existing verifiers/finalizers keep reading known `status` values.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-lifecycle-projection-writer-contract-v1"
  conflictsWith:
    - "05-pid-liveness-contract-v1"
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
    - ".claude/scripts/fixtures/latest-dispatch-lifecycle/"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- Define allowed `latest-dispatch.status` enum.
- Define lifecycle detail fields and their expected semantics.
- Define event mapping from dispatcher milestones to lifecycle fields.
- Define backward-compatible reader expectations.

## Out of Scope
- Dispatcher code changes in this document-writing turn.
- Replacing existing `status` consumers.
- Adding unsupported `status` values such as `preflight_passed` or `dispatch_started`.
- PID liveness namespace details beyond referencing Phase 05.

## `latest-dispatch.status` Enum
| Status | Meaning | Compatibility Rule |
|--------|---------|--------------------|
| `prepared` | Dispatch payload is prepared but child execution has not completed. | Existing active/prepared readers must continue to accept it. |
| `running` | Dispatch child is actively running when supported by current consumers. | Must not replace `prepared` unless reader compatibility is proven. |
| `completed` | Dispatch completed successfully. | Terminal success status. |
| `failed` | Dispatch failed. | Terminal failure status. |
| `superseded` | Dispatch was superseded by closeout/finalizer projection. | Terminal superseded status. |
| `superseded-by-local-fallback` | Dispatch was superseded by local fallback closeout. | Terminal recovered fallback status. |

## Lifecycle Detail Fields
| Field | Required When | Meaning |
|-------|---------------|---------|
| `lifecycleEvent` | every lifecycle transition | Fine-grained event name such as `preflight_passed`, `dispatch_started`, `dispatch_heartbeat`, `dispatch_failed`. |
| `dispatchStage` | dispatcher-owned events | Coarse stage such as `preflight`, `prepared`, `child_running`, `closeout`, `terminal`. |
| `lastLifecycleEventAt` | every lifecycle transition | ISO timestamp of latest lifecycle transition. |
| `lastHeartbeatAt` | heartbeat or child runtime evidence | Latest child or dispatcher heartbeat timestamp. |
| `lastLogAt` | log cursor evidence exists | Latest observed child log timestamp. |

## Dispatch Event Mapping
| Milestone | `status` | `lifecycleEvent` | `dispatchStage` |
|-----------|----------|------------------|-----------------|
| Git/runtime preflight passed | `prepared` | `preflight_passed` | `preflight` |
| Latest dispatch file initialized | `prepared` | `dispatch_prepared` | `prepared` |
| Child process started | `prepared` or `running` according to compatible reader support | `dispatch_started` | `child_running` |
| Heartbeat observed | unchanged | `dispatch_heartbeat` | `child_running` |
| Child completed | `completed` | `dispatch_completed` | `terminal` |
| Child failed | `failed` | `dispatch_failed` | `terminal` |
| Local fallback closed the phase | `superseded-by-local-fallback` | `dispatch_superseded` | `terminal` |
| Finalizer superseded stale dispatch | `superseded` | `dispatch_superseded` | `terminal` |

## Acceptance Criteria
- AC-03: `latest-dispatch.status` allows only `prepared`, `running`, `completed`, `failed`, `superseded`, and `superseded-by-local-fallback`.
- AC-03: `preflight_passed`, `dispatch_started`, and `dispatch_failed` are lifecycle events, not status values.
- AC-03: Existing finalizer and verifier paths remain compatible with `status` values.
- AC-03: Lifecycle timestamps are additive metadata and do not replace terminal status.

## Verification Evidence
| Evidence | Command | Expected Signal | Evidence Path |
|----------|---------|-----------------|---------------|
| Status enum present | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/03-dispatch-lifecycle-contract-v1.md -Pattern "latest-dispatch.status","preflight_passed"` | Enum and lifecycle mapping exist. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |
| Future dispatch tests | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | Lifecycle values do not appear as `status`. | `.claude/verification-results-lifecycle-projection-phase03.log` |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add lifecycle metadata writes | 1) Add lifecycle fields through writer. 2) Preserve existing `status` values. | Fixtures show lifecycle fields without status vocabulary drift. |
| P03-2 | Add compatibility tests | 1) Assert allowed status enum. 2) Assert lifecycle events are separate. | Tests fail on `status=dispatch_started` or `status=preflight_passed`. |
| P03-3 | Update closeout reader assumptions | 1) Verify finalizer reads status as before. 2) Read lifecycle fields only as optional detail. | Existing closeout tests pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | Dispatch progress is observable without breaking existing latest-dispatch status readers. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | Lifecycle events are present and status enum remains compatible. | `.claude/verification-results-lifecycle-projection-phase03.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | `.claude/scripts/fixtures/latest-dispatch-lifecycle/*.json` | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/moonshot-phase-dispatch.test.mjs` | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | Status enum unchanged; lifecycle detail fields present. |
| P03-2 | none | `.claude/scripts/phase-closeout-finalize.mjs` only if reader assumptions require optional lifecycle consumption | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/*.test.mjs` | Closeout readers remain compatible. |

## Blockers And Review
- Blocker condition: any existing consumer rejects additive lifecycle metadata.
- First review checkpoint: status enum and lifecycle field names before dispatcher write changes.
- Re-review trigger: any proposal to add lifecycle events as status values.
- Verification evidence path: `.claude/verification-results-lifecycle-projection-phase03.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- [ ] Regression: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Test fixture where lifecycle events are separate from status.
- Regression logs for dispatcher and closeout paths.
- Changed file list limited to owned paths.

## Deliverables
- Backward-compatible latest-dispatch lifecycle contract implementation in a later run.
- Tests that fail on unsupported status vocabulary drift.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Acceptance criteria AC-03 passes.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 05 may add PID/liveness fields to the same lifecycle payload, but it must not expand `latest-dispatch.status`.

