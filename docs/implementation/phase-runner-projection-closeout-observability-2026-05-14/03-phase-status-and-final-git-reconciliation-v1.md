# Phase 03: Phase Status and Final Git Reconciliation

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "phase-status-closeout"
  dependsOn:
    - "01-projection-vocabulary-canonicalization-v1.md"
  conflictsWith:
    - "04-post-closeout-reconcile-barrier-v1.md"
    - "06-runner-bottleneck-telemetry-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.test.mjs"
    - ".claude/scripts/phase-final-git-closeout.mjs"
    - ".claude/scripts/phase-final-git-closeout.test.mjs"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-3: completed phase can retain `attempts.lastOutcome=running`.
- REQ-4: final git closeout fields can remain stale after commit/push sync.
- AC-3, AC-4.

## Goal

Ensure `phase-status.yaml` has coherent terminal status after phase completion and after final git closeout.

## Scope

Patch phase-status update and final git closeout status reconciliation. Do not change git commit staging policy.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add failing test for completed phase with `attempts.lastOutcome=running`. | `agent-loop-phase-state.test.mjs` | Test reproduces mismatch. |
| T2 | Force terminal attempt outcome when phase status becomes completed. | `agent-loop-phase-state.mjs` | Attempt outcome is completed or verified. |
| T3 | Add failing test for stale final git closeout status after branch is synced. | final git closeout test | Stale fields are reproduced. |
| T4 | Clear or replace stale closeout fields after successful final git closeout. | final git closeout script | `checkpoint_required` and `dirty_worktree` are gone. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-05 | Phase completed implies terminal attempt outcome. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs` | no `lastOutcome=running` under completed phase. | QA_REPORT.md |
| SCN-06 | Successful final git closeout clears stale stop reason. | `node --test .claude/scripts/phase-final-git-closeout.test.mjs` | final status is synced/complete. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-state.test.mjs
node --test .claude/scripts/phase-final-git-closeout.test.mjs
node --test .claude/scripts/verify-phase-closeout.test.mjs
git diff --check
```

## Blocker Condition

Stop if no focused final git closeout test file exists and the current closeout script is not unit-testable without running real git operations. Add a seam or fixture-only helper rather than running destructive git commands.

## Deliverables

- Terminal phase attempt outcome reconciliation.
- Final git closeout status reconciliation.

## Phase Completion Checklist

- [ ] Completed phase cannot retain running attempt outcome.
- [ ] Successful git closeout clears stale checkpoint-required fields.
- [ ] Tests pass without real remote mutation.
