# Phase 03: Dispatch Lifecycle and Retry Suppression (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-006 | WASTE_REGISTER | Coordinator restart-cap loops prevented | Add coordinator route preflight and no-progress stop |
| MWR-007 | WASTE_REGISTER | Delegated terminal no-closeout loops blocked | Stop instead of restart without closeout/progress |
| MWR-008 | WASTE_REGISTER | Stale worker cleanup scoped to active run | Bind cleanup to run lease and command signature |
| MWR-009 | WASTE_REGISTER | Worktree fallback surfaced as evidence | Record fallback reason and count |
| MWR-010 | WASTE_REGISTER | Dirty worktree preflight before expensive dispatch | Move final-git closeout preflight earlier |

## Goal

- Prevent control-plane loops from consuming worker time when no implementation progress is possible.

## Expected Outcome

- Coordinator fork-unavailable, repeated clean exit with actionable phases, signal-like no-closeout, and dirty worktree preconditions stop or route deterministically.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn: ["01"]
  conflictsWith: ["05"]
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/phase-worktree-coordinator.mjs"
    - ".claude/scripts/verify-phase-runner-boundary.sh"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/phase-final-git-closeout.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch_after_phase01"
```

## Scope

- In scope:
  - Preflight Codex in-session coordinator fork capability.
  - Stop signal-like delegated terminal no-closeout restarts.
  - Scope stale worker termination.
  - Surface worktree fallback count and reason.
  - Run final git closeout preflight before expensive dispatch.
- Out of scope:
  - Verdict schema changes.

## Preconditions and Inputs

- Phase 01 complete.
- Existing files:
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/phase-final-git-closeout.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P03-1 | Coordinator route preflight | Detect unavailable Codex fork path before launching coordinator | No `in-session-coordinator-restart-cap` when delegated route is required |
| P03-2 | No-progress restart guard | Compare phase status/artifact checksum before restart | Restart blocked when no artifact or status progress occurred |
| P03-3 | No-closeout signal stop | Replace signal-like restart with stop when closeout is absent | `delegated-terminal-signal-no-closeout` has no restart event after it |
| P03-4 | Scoped stale cleanup | Match worker cleanup against run lease id and command signature | Cleanup ignores unrelated Codex/agent processes |
| P03-5 | Early dirty worktree audit | Run final-git preflight before delegated launch | Dirty worktree failure occurs before child launch |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P03-1 | Fork-unavailable Codex route does not restart-cap | `bash .claude/scripts/verify-phase-runner-boundary.sh` | delegated route selected once | `.claude/logs/agent-loop/debug.jsonl` |
| SCN-P03-2 | Signal-like no-closeout does not relaunch blindly | `bash .claude/scripts/verify-phase-runner-boundary.sh` | stop reason `delegated-terminal-signal-no-closeout` | `.claude/logs/agent-loop/waste-ledger.jsonl` |
| SCN-P03-3 | Dirty worktree is reported before worker launch | `bash .claude/scripts/verify-phase-runner-boundary.sh` | no delegated child launch before dirty audit failure | `.claude/logs/agent-loop/final-git-closeout-*.json` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P03-1 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/verify-phase-runner-boundary.sh` | `bash .claude/scripts/verify-phase-runner-boundary.sh` | RED: restart-cap; GREEN: deterministic route/stop |
| P03-2 | none | `.claude/scripts/phase-run-lease.mjs`, `.claude/scripts/phase-worktree-coordinator.mjs` | boundary verifier | `node --check .claude/scripts/phase-run-lease.mjs` | GREEN: syntax and boundary checks pass |

## Blockers And Review

- Blocker condition: dispatch code cannot determine closeout/progress state without reading shared status.
- First review checkpoint: after P03-2, inspect stop reason names for backward compatibility.
- Re-review trigger: any change to `PHASE_RUN_LEASE_ID` lifecycle.
- Verification evidence path: `.claude/verification-verdict-phase03-dispatch-lifecycle.json`.

## Validation Plan

- [ ] Syntax checks: `node --check .claude/scripts/moonshot-phase-dispatch.mjs && node --check .claude/scripts/phase-run-lease.mjs`
- [ ] Behavior checks: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] Worktree coordinator: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`

## Evidence to Mark Done

- Boundary output for restart suppression.
- Debug log sample for route preflight and no-progress stop.
- Stale worker cleanup scoped to active run evidence.

## Deliverables

- Dispatch lifecycle guards and retry suppression.

## Phase Completion Checklist

- [ ] Coordinator restart-cap loop cannot recur under known fork-unavailable condition
- [ ] Signal-like no-closeout restart is blocked
- [ ] Dirty worktree preflight runs before expensive worker launch

## Handoff Notes

- Phase 05 will add waste ledger records for stop reasons created here.

