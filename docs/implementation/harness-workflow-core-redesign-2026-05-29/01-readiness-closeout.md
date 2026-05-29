# Phase 01 - Readiness Closeout

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: readiness
  dependsOn: []
  conflictsWith:
    - "02-control-plane-registry"
    - "03-state-authority-refactor"
    - "04-evidence-pipeline-split"
    - "05-skill-surface-decomposition"
    - "06-runtime-capability-taxonomy"
    - "07-cross-surface-propagation"
    - "08-controlled-harness-adoption"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/readiness/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/00-master-plan-v1.md"
  readOnlyPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/**"
    - "docs/implementation/execution/**"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/**"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/**"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/**"
  requiresManualEvidence: true
  mergePolicy: sequential_preparation_only
```

## Objective

Make the plan package safe to dispatch by classifying dirty paths, stale plan/runtime surfaces, phase inventory, and runtime pointers before any implementation phase edits source or skill files.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-011 | Reviewer Iter 01 | Readiness closeout artifacts under `readiness/` | `readinessDecision` can move from `prep_phase_required` to `runnable` or stay blocked with named blockers |
| AC-012 | Reviewer Iter 01 | Phase docs and phase inventory check | Dry-run reports selected master and eight selected phase docs without extra/missing root phase docs |

## Tasks

| Task | Files / Surfaces | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Worktree classification | `git status --short --branch` | Any dirty path lacks classification or owner | Every path is classified as `baseline`, `draft`, `generated`, `superseded`, or `unknown` | `readiness/worktree-classification.md` | Stop if any `unknown` remains |
| T02 | Plan root inventory | `Get-ChildItem docs/implementation -File`; `Get-ChildItem docs/implementation/harness-workflow-core-redesign-2026-05-29 -File` | Root `NN-*.md` would be picked up outside selected package | Selected phase docs match master checklist | `readiness/phase-inventory.md` | Stop on extra/missing phase doc |
| T03 | Runtime pointer inventory | Inspect `.claude/docs/phase-status.yaml` and workflow-enforcement projections | Pointer references unrelated active workstream that cannot be archived safely | Pointers are absent, archived, or target this package | `readiness/pointer-self-check.md` | Stop on active external workstream |
| T04 | Dry-run preparation | `node .claude/scripts/prepare-implementation-plan-state.mjs --dry-run --plan-dir docs/implementation/harness-workflow-core-redesign-2026-05-29 --master-plan docs/implementation/harness-workflow-core-redesign-2026-05-29/00-master-plan-v1.md --status-file .claude/docs/phase-status.yaml --execution-root docs/implementation/harness-workflow-core-redesign-2026-05-29/execution --archive-label harness-workflow-core-redesign-2026-05-29` | `extraInRoot`, `missingFromRoot`, stale pointer leak, or mismatched phase count | Dry-run prints safe archive/preparation plan and matching phase inventory | `readiness/prepare-dry-run.txt` | Do not run non-dry-run until dry-run is clean |

## Blockers

- Any `unknown` dirty path.
- Any active runtime pointer that belongs to another workstream and cannot be archived.
- Dry-run reports `extraInRoot`, `missingFromRoot`, or stale pointer mismatch.
- Master checklist and dry-run phase inventory disagree.

## Completion Criteria

- `readiness/worktree-classification.md` exists and has no `unknown` entries.
- `readiness/phase-inventory.md` confirms eight phase docs and no stale root phase docs.
- `readiness/pointer-self-check.md` confirms runtime pointers are absent, archivable, or this package-owned.
- `readiness/prepare-dry-run.txt` shows the dry-run pass signal.
