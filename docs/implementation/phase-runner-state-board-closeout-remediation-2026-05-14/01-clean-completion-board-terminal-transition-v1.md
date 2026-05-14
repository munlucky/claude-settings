# Phase 01: Clean Completion Board Terminal Transition

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "state-board-core"
  dependsOn: []
  conflictsWith:
    - "02-state-board-terminal-projection-invariants-v1.md"
    - "03-startup-pending-projection-classification-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/logs/workflow-enforcement/STATE.md"
    - ".claude/logs/workflow-enforcement/current-run.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-1: Clean completion leaves `STATE.md.status=active` while the matching run projection has `finalVerdict=complete`.
- AC-1: Clean completion writes terminal board transition.
- AC-2: Blocking closeout failures do not write terminal complete; advisory commit prompt failure does not roll back a completed board.

## Goal

Make `finalizeCompletion()` close the simple run board to `status: complete` for the current `stateRunId` only after all blocking closeout substeps succeed.

Terminal transition order:

1. Run `runPhaseCloseoutFinalizer()`.
2. Publish required QA/HANDOFF artifacts.
3. Write the simple run board terminal transition: `status: complete` for the same `stateRunId`.
4. Generate the commit prompt as an advisory convenience step.

Failure semantics:

| Substep | Blocking | Expected board result |
| --- | --- | --- |
| `runPhaseCloseoutFinalizer()` failure | Yes | Do not write `status: complete`; preserve the non-terminal board state for resume or diagnosis. |
| Required QA/HANDOFF artifact publication failure | Yes | Do not write `status: complete`; return/raise the failure through the existing completion path. |
| Commit prompt generation failure | No | Keep the completed board transition; surface the prompt failure as advisory evidence or warning only. |

## Scope

Modify only the runner completion path and focused tests.

Out of scope:

- Changing blocked or fatal paths.
- Moving `STATE.md` to a different storage model.
- Rewriting `phase-closeout-finalize.mjs`.

## Preconditions

- Worktree is clean before implementation.
- Current board/projection mismatch is treated as reproduction evidence, not as a mutable fixture to edit manually.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add a focused failing test for clean completion writing a complete simple run board. | `.claude/scripts/agent-loop-phase-runner.test.mjs` | Test fails because `STATE.md` remains `active`. |
| T2 | Add or use a small helper from the runner to write terminal complete state after finalizer success. | `.claude/scripts/agent-loop-phase-runner.mjs` | The same test passes. |
| T3 | Add a failed-finalizer regression asserting the board is not marked complete when `runPhaseCloseoutFinalizer()` fails. | `.claude/scripts/agent-loop-phase-runner.test.mjs` | Failure path keeps non-terminal board status. |
| T4 | Add a QA/HANDOFF publication failure regression asserting the board is not marked complete when required evidence cannot be written. | `.claude/scripts/agent-loop-phase-runner.test.mjs` | Blocking post-finalizer failure keeps non-terminal board status. |
| T5 | Add a commit-prompt failure regression asserting advisory prompt failure does not roll back a completed board. | `.claude/scripts/agent-loop-phase-runner.test.mjs` | Board remains `complete` and the failure is reported as advisory. |
| T6 | Run focused and adjacent suites. | test commands below | All required tests pass. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-01 | A successful phase closes the board to `complete`. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Test asserts `STATE.md.status === "complete"`. | Phase QA report |
| SCN-02 | A finalizer failure does not create a false complete board. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Test asserts terminal complete is absent on finalizer failure. | Phase QA report |
| SCN-02A | A required QA/HANDOFF publication failure does not create a false complete board. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Test asserts terminal complete is absent on required evidence publication failure. | Phase QA report |
| SCN-02B | A commit prompt failure is advisory after a clean closeout. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Test asserts terminal complete remains present and prompt failure is surfaced as warning/advisory evidence. | Phase QA report |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/simple-run-state.test.mjs
git diff --check
```

Blocker condition: if `finalizeCompletion()` cannot be exercised without a broad test harness rewrite, stop and add a smaller exported helper boundary rather than touching runtime state files directly.

## Deliverables

- Runner completion code writes a complete board transition after blocking closeout substeps.
- Regression tests for success, finalizer failure, QA/HANDOFF failure, and advisory commit-prompt failure behavior.
- QA evidence with focused test output.

## Phase Completion Checklist

- [ ] Red test reproduces stale `active` board on clean completion.
- [ ] Implementation writes terminal complete only after finalizer and required QA/HANDOFF success.
- [ ] Commit prompt failure is documented and tested as advisory.
- [ ] Focused tests pass.
- [ ] Diff hygiene passes.
