# Phase 02: Dispatch Resume Board Validation (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | Finding P1 / dispatch resume | `--resume` must validate `STATE.md` before dispatch writes evidence or leases. | Move resume board validation before dispatch mutation. |
| REQ-2.2 | Finding P1 / stateRunId source | Dispatch must not restore `stateRunId` primarily from compatibility projections. | Make `STATE.md` the resume identity source. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-03 | REQ-2.1 | `moonshot-phase-dispatch.test.mjs` proves `--resume` with missing board exits `resume-state-missing` before dispatch evidence write. |
| AC-04 | REQ-2.2 | Test proves compatibility projection `stateRunId` is ignored when global `STATE.md` is missing or mismatched. |

## Goal
Prevent dispatch from mutating compatibility projections for a resume attempt before the current board has been validated.

## Expected Outcome
- `--resume` reads `.claude/logs/workflow-enforcement/STATE.md` first.
- Missing board or missing `stateRunId` fails with `resume-state-missing`.
- `projectionStatus=pending` fails with `incomplete_transaction`.
- Existing active/blocked board without `--resume` fails with `resume-required`.
- Dispatch evidence and lease writes happen only after the board gate passes.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01-current-board-path-unification-v1.md"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_cli"
```

## Scope
- In scope:
  - Introduce or reuse a dispatch startup board classifier.
  - Ensure `initializeDispatchRunIdentity()` uses `STATE.md` for `--resume` identity.
  - Keep compatibility projections as validation targets, not primary resume identity.
  - Add ordering tests that prove no dispatch evidence is written on failed resume validation.
- Out of scope:
  - Changing public option name or adding new resume commands.
  - Automatically repairing pending state.
  - Changing lower runner resume semantics except through validated arguments.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add dispatch board gate | Call helper read/classification before dispatch evidence and lease writes. | Failed gate exits before `recordDispatchEvidence` and active lease writes. |
| P02-2 | Remove projection-primary identity | Stop using `active-phase-run.json/current-run.json/latest-dispatch.json` as the primary resume identity source. | Projection identity is checked only after board identity exists. |
| P02-3 | Add negative tests | Cover `--resume` missing board, empty `stateRunId`, pending board, and projection-only stateRunId. | Tests fail on current implementation and pass after fix. |
| P02-4 | Preserve downward propagation | Keep `--resume` forwarding to agent-loop/phase-runner after validation. | Existing parser/help and command propagation tests still pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | `--resume` without `STATE.md` does not dirty compatibility files. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | `resume-state-missing`; no dispatch evidence call. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |
| SCN-02-2 | Projection-only identity cannot masquerade as a valid resume board. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | Test rejects projection-only `stateRunId`. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |
| SCN-02-3 | Pending transition stops dispatch before worker launch. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | `incomplete_transaction` is returned or thrown before lower runner invocation. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |

## Validation Plan
- `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`
- `git diff --check`

## Blockers And Review
- Blocker condition: dispatch code cannot be unit-tested without starting real child runners.
- Review checkpoint: mutation ordering is explicit in tests; the first write after `--resume` occurs only after board validation.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/execution/v1/02-phase-02-dispatch-resume-board-validation/QA_REPORT.md`

## Deliverables
- Dispatch-level resume validation.
- Tests for missing board, pending board, projection-only identity, and mutation ordering.

## Phase Completion Checklist
- [x] `--resume` reads `STATE.md` before compatibility projections.
- [x] Missing or malformed board returns `resume-state-missing`.
- [x] Pending board returns `incomplete_transaction`.
- [x] Failed resume validation leaves dispatch evidence and lease files untouched.
