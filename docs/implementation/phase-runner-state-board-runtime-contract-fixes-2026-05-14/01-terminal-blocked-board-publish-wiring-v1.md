# Phase 01: Terminal Blocked Board Publish Wiring (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | Review P1 terminal path | Actual runner terminal blocked path must write `STATE.md` blocked. | Add runner terminal publish boundary. |
| REQ-1.2 | Review P1 production caller | Terminal publisher cannot remain test-only. | Wire production blocked closeout through publisher/shared boundary. |

## Goal
- Ensure every actual runner terminal blocked path produces a committed `STATE.md status=blocked` transition after sidecar/projection writes succeed.

## Expected Outcome
- Production blocked closeout is owned by `stopBlockedPhase()` or a new runner-local helper called only from `stopBlockedPhase()`.
- The call sequence is fixed:
  1. Preserve existing QA/HANDOFF content generation.
  2. Invoke the shared terminal blocked publisher with current `stateRunId`, `runRoot`, attempt id, phase metadata, sidecar paths, and projection targets.
  3. The publisher writes terminal sidecar/manifest evidence and compatibility projections inside one `withStateTransition(... status: blocked ...)` unit.
  4. Only after publisher success, keep legacy phase-status/HANDOFF outputs aligned with the blocked terminal state.
  5. If terminal publish or projection write fails, leave `STATE.md projectionStatus=pending`, return blocked handoff, and do not spawn/retry a worker.
- Same-attempt worker respawn sees `STATE.md status=blocked` and is rejected unless Phase 02 reconciliation rules pass.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential-runtime-state"
  dependsOn: []
  conflictsWith:
    - "02-reconciliation-evidence-path-unification-v1.md"
    - "03-active-transition-projection-commit-semantics-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/phase-execution-paths.mjs"
    - "docs/implementation/phase-runner-simple-state-board-2026-05-13/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_state_patch"
```

## Scope
- In scope:
  - Add or refactor a single runner terminal blocked publish boundary.
  - Preserve existing QA/HANDOFF/phase-status updates.
  - Ensure terminal sidecar/projection writes happen inside one state transition.
- Out of scope:
  - Clean completion board semantics.
  - SQLite/event-sourcing migration.
  - Parallel worker ownership changes.

## Preconditions and Inputs
- Current source review findings in the master plan.
- Existing terminal publisher tests are passing before changes.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Identify all runner blocked exits | Inspect `stopBlockedPhase()` callers and direct `updatePhaseState(... blocked ...)` branches. | Every blocked exit is either routed through the terminal publish boundary or explicitly documented as non-terminal mirror. |
| P01-2 | Wire terminal publisher | Route `stopBlockedPhase()` through one production terminal boundary that passes current `stateRunId`, `runRoot`, `attemptId`, phase metadata, `paths.phaseExecutionDir`, and projection files into `publishTerminalBlockedOutcome(...)` or a shared helper. | A blocked closeout writes sidecar/manifest, projections, and `STATE.md` committed; failed publish leaves pending and prevents worker retry. |
| P01-3 | Preserve legacy artifacts | Keep QA/HANDOFF/phase-status writes with identical user-visible content unless terminal semantics require blocked fields. | Existing closeout tests do not regress. |
| P01-4 | Add regression tests | Add a behavioral test where a runner blocked path produces `STATE.md status=blocked`. | Test fails before wiring and passes after. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A real terminal blocked runner path cannot leave the current board active. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | test asserts `STATE.md status=blocked projectionStatus=committed` | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-01-2 | Terminal blocked publish remains atomic: failed projection keeps pending. | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | pending-on-failure test passes | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | before: no production board blocked assertion; after: pass |
| P01-2 | none | `.claude/scripts/lib/terminal-blocker-publisher.mjs` if helper signature needs runRoot mirroring | `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: terminal publisher cannot receive stable attempt identity from runner context.
- First review checkpoint: after adding the first failing test for `stopBlockedPhase()` board transition.
- Re-review trigger: any change that writes `STATE.md` outside `withStateTransition(...)`.
- Verification evidence path: `docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/execution/01-terminal-blocked-board-publish-wiring-v1/QA_REPORT.md`.

## Production Boundary Contract
- Owner: `stopBlockedPhase()` in `.claude/scripts/agent-loop-phase-runner.mjs`.
- Allowed helper: one runner-local `publishRunnerBlockedCloseout(...)` wrapper if needed to adapt runner context into `publishTerminalBlockedOutcome(...)`.
- Forbidden pattern: writing `STATE.md status=blocked` directly in the runner or leaving `publishTerminalBlockedOutcome(...)` callable only from tests.
- Failure behavior: terminal publish failure must preserve pending board state and surface a blocked/handoff result; it must not downgrade to active, running, retry, or worker spawn.

## Validation Plan
- [ ] Behavior checks: `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] Regression checks: `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- [ ] Diff hygiene: `git diff --check`

## Evidence to Mark Done
- Test output for the two commands above.
- Changed file list.
- QA note proving actual runner blocked path writes board terminal state.

## Deliverables
- Runtime terminal blocked boundary in `.claude/scripts/agent-loop-phase-runner.mjs`.
- Regression coverage in `.claude/scripts/agent-loop-phase-runner.test.mjs`.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 02 should reuse the exact sidecar/manifest path chosen here.
