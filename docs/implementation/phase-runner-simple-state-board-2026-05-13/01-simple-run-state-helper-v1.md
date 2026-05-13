# Phase 01: Simple Run State Helper (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | v5 / Single transition helper | Add `simple-run-state.mjs` with the only `STATE.md` transition API. | Create helper and unit tests. |
| REQ-1.2 | v5 / STATE.md header | Parse and write `STATE.md` with required machine-readable headers. | Implement round-trip parser/writer. |
| REQ-1.3 | v5 / pending commit | Detect incomplete pending transition on next execution. | Add pending/commit tests and guard result. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | `node --test .claude/scripts/lib/simple-run-state.test.mjs` covers exported API and transition rules. |
| AC-02 | REQ-1.2 | Round-trip test proves `stateRunId`, `transitionId`, `projectionStatus`, `planDir`, `statusFile`, `status`, `phase`, `attempt`, `owner`, `reason`, `runRoot`, and `updated` survive parsing. |
| AC-03 | REQ-1.3 | A thrown projection writer leaves `projectionStatus=pending`; startup guard returns `incomplete_transaction`. |

## Goal
- Establish a small, boring state helper that all later phases can call instead of hand-editing `STATE.md`.

## Expected Outcome
- `STATE.md` can be read and written deterministically.
- `withStateTransition(...)` owns pending/commit behavior.
- Transition rules reject unsafe active transitions before runner callsites use them.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - "docs/implementation/phase-runner-simple-state-board-2026-05-13/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_foundation"
```

## Scope
- In scope:
  - Implement `readState(options)`.
  - Implement `withStateTransition(nextState, options, writeProjectionsFn)`.
  - Implement `assertCanTransition(previous, next, options)`.
  - Implement `scrubCompatibilityProjection(payload, state, { targetKind, previousPayload })`.
  - Implement `resolveRunRoot(stateRunId)` and state header round-trip helpers if needed.
  - Implement startup classification for `resume-required`, `resume-state-missing`, and `incomplete_transaction`.
- Out of scope:
  - Editing runner callsites.
  - Publishing terminal blocker sidecars.
  - Rewriting global compatibility files.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Create helper module | 1) Define allowed statuses. 2) Define required header list. 3) Add parser/writer. | Missing required headers are explicit `unknown` or validation failures, not silent success. |
| P01-2 | Implement transition rules | 1) Reject `complete/cancelled -> active`. 2) Reject same-attempt `blocked -> active` without reconciliation. 3) Allow new-attempt `blocked -> active`. | Unit tests cover allowed and rejected paths. |
| P01-3 | Implement pending/commit wrapper | 1) Write pending with new `transitionId`. 2) Call `writeProjectionsFn`. 3) Commit same transition id only after success. | Failure fixture leaves pending; success fixture commits. |
| P01-4 | Implement scrub rules | 1) Blocked forces terminal fields. 2) Active removes stale terminal fields. 3) Complete removes active fields. | Unit tests cover each target kind. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A failed projection write is visible as incomplete, not silently active. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | `projectionStatus=pending` and startup returns `incomplete_transaction`. | `.claude/scripts/lib/simple-run-state.test.mjs` |
| SCN-01-2 | Same-attempt blocked state cannot be restarted accidentally. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | `assertCanTransition` throws or returns rejection for same-attempt `blocked -> active`. | `.claude/scripts/lib/simple-run-state.test.mjs` |
| SCN-01-3 | New attempt can resume blocked work only as a distinct attempt. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | Different attempt id permits `blocked -> active`. | `.claude/scripts/lib/simple-run-state.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/simple-run-state.mjs`, `.claude/scripts/lib/simple-run-state.test.mjs` | none | same | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | exit 0; pending/commit and transition matrix covered |
| P01-2 | none | none | `.claude/scripts/lib/simple-run-state.mjs` | `node --check .claude/scripts/lib/simple-run-state.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: helper needs terminal sidecar fields that cannot be obtained without coupling to verifier internals.
- Review checkpoint: API shape and transition matrix before callsite integration.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-2026-05-13/execution/v1/01-phase-01-simple-run-state-helper/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- [ ] `node --check .claude/scripts/lib/simple-run-state.mjs`

## Deliverables
- `simple-run-state.mjs`.
- Unit tests covering round-trip, transition rules, pending/commit, startup classification, reconciliation checks, and projection scrub.

## Phase Completion Checklist
- [ ] `STATE.md` round-trip is deterministic.
- [ ] `withStateTransition(...)` is the only helper that writes pending/committed status.
- [ ] Pending transition is detectable on next execution.
- [ ] Unsafe terminal-to-active transitions are rejected.
