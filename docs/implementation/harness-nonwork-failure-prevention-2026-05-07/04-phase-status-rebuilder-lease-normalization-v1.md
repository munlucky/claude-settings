# Phase 04: Phase Status Rebuilder And Lease Normalization (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-006 | User improvement units | `phase-status.yaml` can be rebuilt from ledger/artifacts and normalized after finished runs | Add rebuild command and root status cleanup |
| NWFP-005 | User improvement units | Active truth source must ignore stale verdicts | Use Phase 03 verdict relevance during rebuild |

## Goal

- Repair phase ledger inconsistencies without manual YAML editing and prevent stale root execution fields from surviving finished runs.

## Expected Outcome

- A new `rebuild-phase-status` command can regenerate status counters, attempts, completed timestamps, artifact paths, active root fields, and goal runtime mirror from authoritative phase artifacts and runtime events.
- Finished runs have coherent root status: no stale `activeCurrentStage: ready/isolate`, no active phase number, no stale signals/artifacts block, and normalized run verdict separate from terminal exit details.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "03"
  conflictsWith:
    - "03"
    - "05"
    - "06"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/agent-loop.mjs"
  readOnlyPaths:
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- Included:
  - Add `agent-loop-phase-state.mjs rebuild-phase-status <status-file> <plan-dir>`.
  - Recalculate phase counters from phase blocks and clean-finish artifacts.
  - Create an attempt/event record for manual closeout when completed artifacts exist but `attempts.total=0`.
  - Normalize finished root lease fields and remove stale `signals`/`artifacts` active pointers.
  - Keep delegated terminal exit metadata as stop detail without changing clean artifact truth.
- Excluded:
  - Preparing a new active phase package.
  - Editing completed prior plan docs.
  - Changing verdict identity rules.

## Preconditions And Inputs

- Phase 03 verdict identity guard is merged.
- Required current code:
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/agent-loop.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P04-1 | Add status rebuild command | Parse plan phases, phase artifact paths, QA/SCORECARD/HANDOFF clean-finish state, and runtime event ledger | Command outputs or writes coherent status without touching unrelated plans |
| P04-2 | Normalize finished root fields | On finished/complete with no actionable phases, set current stage/phase to null or finish, remove active pointers, update counters | Current known stale pattern is corrected by fixture |
| P04-3 | Reconcile attempts and timestamps | If phase completed via manual closeout with zero attempts, add synthetic closeout event metadata | `attempts.total=0` plus passed state cannot remain after rebuild |
| P04-4 | Add self-test fixtures | Build temp status files for stale stage, timestamp inversion, delegated exit mismatch, and zero attempts | `agent-loop-phase-state self-test` covers rebuild behavior |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P04-1 | none | `.claude/scripts/agent-loop-phase-state.mjs` | self-test in same file | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Includes rebuild fixture pass |
| P04-2 | none | `.claude/scripts/phase-run-lease.mjs`, `.claude/scripts/runtime-state.mjs` if needed | boundary verifier | `bash .claude/scripts/verify-phase-runner-boundary.sh` | Boundary smoke passes |
| P04-3 | none | `.claude/scripts/agent-loop.mjs` if needed | none | `node --check .claude/scripts/agent-loop.mjs` | Exit 0 |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P04-1 | Finished run does not show `activeCurrentStage: ready/isolate` | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | fixture root stage normalized | `QA_REPORT.md` self-test output |
| SCN-P04-2 | Passed phase cannot have `attempts.total=0` after rebuild | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | synthetic/manual closeout attempt represented | `QA_REPORT.md` self-test output |
| SCN-P04-3 | Delegated terminal exit code does not overwrite clean completion truth | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | terminal exit detail and clean verdict coexist coherently | `QA_REPORT.md` self-test output |

## Blockers And Review

- Blocker condition: Rebuild command changes another active plan, drops archived phase docs, or marks incomplete phases complete.
- First review checkpoint: Review fixture output before applying command to real `.claude/docs/phase-status.yaml`.
- Re-review trigger: Any change to root lease or goal runtime mirror export behavior.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/04-phase-04-phase-status-rebuilder-and-lease-normalization-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/agent-loop-phase-state.mjs && node --check .claude/scripts/runtime-state.mjs && node --check .claude/scripts/phase-run-lease.mjs`
- [ ] State self-test: `node .claude/scripts/agent-loop-phase-state.mjs self-test`
- [ ] Boundary regression: `bash .claude/scripts/verify-phase-runner-boundary.sh`

## Completion Evidence

- Rebuild fixture output.
- Boundary verifier output.
- Before/after status fixture excerpt in QA.

## Deliverables

- Status rebuild command.
- Finished-run root normalization.
- Attempt/timestamp reconciliation fixtures.

## Phase Completion Checklist

- [ ] Rebuild command exists and is documented in usage output.
- [ ] Finished root status fields normalize correctly.
- [ ] Attempts and timestamps are coherent after rebuild.
- [ ] Verification commands pass.

## Handoff Notes

- Phase 06 should include rebuild command in closeout docs and regression contract if it becomes a supported operator tool.
