# Phase 03: Projection Scrub and Lease Heartbeat Guard (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | v5 / target-aware projection scrub | Apply scrub rules by target kind and preserve `latest-dispatch.status` vocabulary. | Integrate scrub at lifecycle writer boundary. |
| REQ-3.2 | v5 / heartbeat preserve | Active heartbeat must not downgrade terminal state. | Harden lease store active heartbeat path. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-06 | REQ-3.1 | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` covers target-aware scrub and `latest-dispatch.status` vocabulary. |
| AC-07 | REQ-3.2 | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` proves active heartbeat preserves terminal state and does not open pending transition. |

## Goal
- Keep compatibility projections useful without allowing them to contradict terminal `STATE.md` or sidecar evidence.

## Expected Outcome
- Same-attempt terminal payload plus active patch is preserved/no-op.
- New-attempt active patch can scrub stale terminal fields.
- Heartbeats remain lightweight mirrors and never create `STATE.md` pending transitions.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01-simple-run-state-helper-v1"
    - "02-resume-cli-run-identity-guard-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_projection_boundary"
```

## Scope
- In scope:
  - Call `scrubCompatibilityProjection(...)` in `recordLifecycleTransition(...)`.
  - Derive `targetKind` from file basename or explicit event metadata.
  - Preserve existing `latest-dispatch.status` lifecycle-event guard.
  - Harden `phase-run-lease-store.mjs` so active heartbeat cannot overwrite terminal same-attempt state.
  - Reject `stateRunId` mismatch before lease/current-run projection write.
- Out of scope:
  - Publishing terminal blocked sidecar/manifest.
  - Worker spawn behavior.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Integrate scrub in lifecycle writer | 1) Read previous payload. 2) Call scrub with target kind. 3) Preserve vocabulary assertion. | Lifecycle writer tests cover blocked, active, complete, and latest-dispatch cases. |
| P03-2 | Harden lease heartbeat | 1) Detect terminal same-attempt previous payload. 2) Preserve terminal fields on active heartbeat. 3) Do not call `withStateTransition` for heartbeat. | Lease tests prove no pending `STATE.md` is created. |
| P03-3 | Add stateRunId mismatch rejection | 1) Add previous payload mismatch test. 2) Throw before write. | Global files are not overwritten on mismatch. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A blocked run cannot look running after heartbeat. | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` | `completionStatus=blocked` and `activeExecutionStatus=blocked` remain. | `.claude/scripts/lib/phase-run-lease-store.test.mjs` |
| SCN-03-2 | `latest-dispatch.status` stays compatible with existing readers. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | lifecycle event string in `status` is rejected. | `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/lib/lifecycle-projection-writer.mjs` | `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | exit 0; scrub/vocabulary cases pass |
| P03-2 | `.claude/scripts/lib/phase-run-lease-store.test.mjs` | `.claude/scripts/lib/phase-run-lease-store.mjs` | `.claude/scripts/lib/phase-run-lease-store.test.mjs` | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` | exit 0; heartbeat preserve and stateRunId rejection pass |

## Blockers And Review
- Blocker condition: target kind cannot be inferred safely for non-standard projection path; add explicit metadata rather than guessing.
- Review checkpoint: preserve semantics for same-attempt terminal payloads before touching terminal publisher.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-2026-05-13/execution/v1/03-phase-03-projection-scrub-lease-heartbeat-guard/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- [ ] `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`

## Deliverables
- Target-aware projection scrub integration.
- Lease heartbeat terminal preserve guard.
- New `.claude/scripts/lib/phase-run-lease-store.test.mjs` coverage for heartbeat preserve, no pending transition, and `stateRunId` mismatch rejection.
- `stateRunId` mismatch hard reject in projection write paths.

## Phase Completion Checklist
- [ ] Same-attempt terminal active patch is preserved/no-op.
- [ ] New-attempt active patch scrubs stale terminal fields.
- [ ] Heartbeat does not create pending transition.
- [ ] `latest-dispatch.status` vocabulary stays constrained.
