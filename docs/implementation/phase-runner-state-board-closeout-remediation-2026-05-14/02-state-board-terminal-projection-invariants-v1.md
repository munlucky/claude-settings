# Phase 02: State Board Terminal Projection Invariants

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "state-board-core"
  dependsOn:
    - "01-clean-completion-board-terminal-transition-v1.md"
  conflictsWith:
    - "01-clean-completion-board-terminal-transition-v1.md"
    - "03-startup-pending-projection-classification-v1.md"
  ownedPaths:
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/STATE.md"
    - ".claude/logs/workflow-enforcement/current-run.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-2: Invariant logic does not detect `board.status=active` with matching terminal projection.
- AC-3: Add violation for active board plus terminal projection.
- AC-4: Preserve existing blocked/complete projection invariant behavior.

## Goal

Make invariant checks fail when a matching projection is terminal but `STATE.md` is still active.

## Scope

Modify only the invariant helper and its tests.

Out of scope:

- Changing projection writer semantics.
- Changing finalizer output schema.
- Broad cleanup of stale runtime artifacts.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add a failing fixture/test for `active board + finalVerdict=complete`. | `.claude/scripts/lib/harness-state-invariants.test.mjs` | Test fails with no violation before implementation. |
| T2 | Add terminal projection detection for the concrete persisted field combinations listed in the terminal projection table below. | `.claude/scripts/lib/harness-state-invariants.mjs` | New violation is emitted. |
| T3 | Keep existing `blocked board + running projection` and `complete board + active projection` cases green. | same files | Existing suite passes. |

## Terminal Projection Table

The invariant should treat a projection as terminal only when the matching `stateRunId` points at one of these concrete persisted shapes:

| Projection source | Required field combination | Expected invariant with `STATE.md.status=active` |
| --- | --- | --- |
| `current-run.json` root | `finalVerdict: "complete"` | Emit `state-board-active-projection-terminal`. |
| `current-run.json` root | `completionStatus: "completed"` and `completedAt` present | Emit `state-board-active-projection-terminal`. |
| `current-run.json.phaseRunLease` | `finalVerdict: "complete"` and `status: "finished"` | Emit `state-board-active-projection-terminal`. |

Do not infer terminal state from loose status synonyms outside these persisted fields unless the implementation first adds a test fixture showing that exact field exists today.

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-03 | Stale active board is rejected for each concrete terminal projection shape: root `finalVerdict=complete`, root `completionStatus=completed` with `completedAt`, and `phaseRunLease.finalVerdict=complete/status=finished`. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | Violation code `state-board-active-projection-terminal`. | Phase QA report |
| SCN-04 | Existing invariant behavior does not regress. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | Existing invariant tests pass. | Phase QA report |

## Validation Plan

```powershell
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/verify-phase-closeout.test.mjs
git diff --check
```

Blocker condition: if projection terminal-state normalization conflicts with an existing non-terminal status, stop and document the exact status table before patching.

## Deliverables

- New invariant violation for active board with terminal projection.
- Regression coverage for the live stale-board shape.

## Phase Completion Checklist

- [ ] Red test reproduces the blind spot.
- [ ] Invariant emits a stable violation code.
- [ ] Adjacent closeout verification remains green.
