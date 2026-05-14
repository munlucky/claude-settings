# Phase 03: Startup Pending Projection Classification

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "state-board-core"
  dependsOn:
    - "02-state-board-terminal-projection-invariants-v1.md"
  conflictsWith:
    - "01-clean-completion-board-terminal-transition-v1.md"
    - "02-state-board-terminal-projection-invariants-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-5: `projectionStatus: pending` plus terminal board/projection mismatch can be classified as `clean_start`.
- AC-5: Startup must classify this as `incomplete_transaction`.

## Goal

Prevent startup from silently treating pending or partially committed state-board data as a clean start.

## Scope

Modify startup classification and focused tests.

Out of scope:

- Introducing new resume modes.
- Changing the public meaning of `--resume`.
- Changing blocked same-attempt reconciliation rules.

Allowed helper boundaries in `.claude/scripts/agent-loop-phase-runner.mjs`:

- `findExistingRunBoard()`: may be extended to surface pending projection residue instead of filtering only `active|blocked|paused` boards.
- `classifyRunnerStartup()`: may classify pending projection residue as `incomplete_transaction`.
- `readSimpleRunStateById()`: may be used to fetch the exact board by persisted `stateRunId` for classification evidence.
- `ensureStartupResumeState()`: may preserve the same classification for explicit `--resume` instead of downgrading to `resume-state-missing`.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add failing tests for `status=complete` with `projectionStatus=pending` in both non-resume and explicit `--resume` startup. | `.claude/scripts/agent-loop-phase-runner.test.mjs` | Current classification returns `clean_start` for non-resume and `resume-state-missing` for resume. |
| T2 | Extend `findExistingRunBoard()`/`readSimpleRunStateById()` discovery beyond only `active|blocked|paused` when the board has pending projection data that indicates partial write. | `.claude/scripts/agent-loop-phase-runner.mjs` | Classification evidence reaches `classifyRunnerStartup()`. |
| T2A | Update `classifyRunnerStartup()` and `ensureStartupResumeState()` so pending projection residue returns the same stop reason for both startup modes. | `.claude/scripts/agent-loop-phase-runner.mjs` | Non-resume and resume both return `incomplete_transaction`. |
| T3 | Preserve normal completed-board cleanup behavior when projection is committed/terminal and no partial transaction exists. | same files | Existing startup tests pass. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-05 | Pending projection residue blocks non-resume startup. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | `classification === "incomplete_transaction"`, not `clean_start`. | Phase QA report |
| SCN-05A | Pending projection residue blocks explicit resume startup. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | `classification === "incomplete_transaction"`, not `resume-state-missing`. | Phase QA report |
| SCN-06 | Valid no-board start remains clean. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Existing clean start fixture remains green. | Phase QA report |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/simple-run-state.test.mjs
git diff --check
```

Blocker condition: if `findExistingRunBoard()` cannot distinguish harmless historical complete boards from pending partial writes with current persisted fields, stop and add the missing evidence field to the plan before implementation.

## Deliverables

- Startup classification fix for pending projection residue across `findExistingRunBoard()`, `classifyRunnerStartup()`, `readSimpleRunStateById()`, and `ensureStartupResumeState()` boundaries.
- Regression tests proving non-resume and resume behavior both stop as `incomplete_transaction`.

## Phase Completion Checklist

- [ ] Red test captures the pending projection startup gap.
- [ ] Startup returns `incomplete_transaction`.
- [ ] Existing resume and clean-start behavior stays green.
