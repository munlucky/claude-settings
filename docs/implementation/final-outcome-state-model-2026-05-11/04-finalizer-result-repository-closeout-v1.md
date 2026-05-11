# Phase 04: Finalizer Result And Repository Closeout Split (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.4 | AC-04 | Plan v8 / Idempotence scope | Strict no-diff excludes append-only diagnostics/event/runtime logs. | Enforce strict target list and document result classification. |
| REQ-1.8 | AC-08 | Plan v8 / Finalizer result / exit code | Default runtime closeout success exits 0 even when repository is dirty; strict repository closeout exits 2. | Split `runtimeCloseout` from `repositoryCloseout` and add strict flag tests. |
| REQ-1.9 | AC-09 | Plan v8 / Write visibility | Result includes `plannedWrites`, `publishWrites`, `skippedWrites`, and no-op result has `idempotentNoop:true`. | Add result fields and tests. |

## Goal
- Make finalizer output explain exactly what it planned, published, skipped, and why repository closeout is separate from runtime outcome.

## Expected Outcome
- Default `finalize` returns `ok:true`, `runtimeCloseout.status=passed`, and `repositoryCloseout.status=pending|clean`.
- Dirty repository does not change runtime verdict and exits 0 by default.
- `finalize --strict-repository-closeout` exits 2 when repository closeout is pending.
- `phase-final-git-closeout assert-clean` keeps existing dirty exit 2 behavior.
- Result JSON includes `plannedWrites`, `publishWrites`, and `skippedWrites` with enough detail to debug no-rewrite decisions.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn: ["01", "02", "03"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/phase-final-git-closeout.mjs"
    - ".claude/scripts/phase-final-git-closeout.test.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - ".git/**"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/**"
    - ".claude/logs/agent-loop/summary.current.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_finalizer_result"
```

## Scope
- In scope:
  - Finalizer result schema fields for runtime/repository closeout.
  - Exit code split for default vs strict repository closeout.
  - `plannedWrites`, `publishWrites`, `skippedWrites` visibility.
  - Strict no-diff assertion list limited to core status/workflow/latest-dispatch/summary files.
- Out of scope:
  - Actual git commit/push automation.
  - Repository cleanup.
  - Append-only log byte-for-byte idempotence.

## Preconditions and Inputs
- Phase 01 canonical no-op result exists.
- Phase 03 summary marker and read-only projection are stable.
- Dirty repository fixture or mocked git status is available for tests.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Split closeout result model | Add `runtimeCloseout` and `repositoryCloseout` objects to result JSON. | Default dirty repo fixture returns `ok:true` with repository pending. |
| P04-2 | Add strict flag | Add `--strict-repository-closeout` to finalizer CLI. | Dirty repo exits 2 only when strict flag is set. |
| P04-3 | Classify writes | Populate `plannedWrites`, `publishWrites`, and `skippedWrites` from write planner/no-op branches. | Tests can explain why canonical files were skipped. |
| P04-4 | Preserve git closeout gate | Keep `phase-final-git-closeout assert-clean` dirty exit 2. | Existing behavior remains covered by test. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Dirty repository after runtime success is closeout pending, not runtime failed. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | result has `ok:true`, `runtimeCloseout.status=passed`, `repositoryCloseout.status=pending`, exit 0. | terminal test output |
| SCN-04-2 | Strict repository closeout fails dirty state with exit 2. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs .claude/scripts/phase-final-git-closeout.test.mjs` | strict finalizer and `assert-clean` dirty fixtures return exit 2. | terminal test output |
| SCN-04-3 | No-op result explains skipped writes. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | JSON includes `idempotentNoop:true` and non-empty `skippedWrites`. | terminal test output |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | optional `.claude/scripts/phase-final-git-closeout.test.mjs` if absent | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Dirty default closeout exits 0 with repository pending. |
| P04-4 | none | `.claude/scripts/phase-final-git-closeout.mjs` | `.claude/scripts/phase-final-git-closeout.test.mjs` | `node --test .claude/scripts/phase-final-git-closeout.test.mjs` | Dirty assert-clean exits 2. |

## Blockers And Review
- Blocker condition: repository dirty/pending mutates `normalizedRunVerdict` or `finalOutcome.status`.
- First review checkpoint: result schema shows runtime and repository closeout independently.
- Re-review trigger: append-only diagnostics logs are added to strict no-diff assertion.
- Verification evidence path: targeted finalizer/git closeout test output.

## Validation Plan
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `node --test .claude/scripts/phase-final-git-closeout.test.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Passing dirty default and strict repository tests.
- Passing write visibility/no-op result tests.
- Existing `phase-final-git-closeout assert-clean` behavior preserved.

## Deliverables
- Finalizer result schema update.
- Strict repository closeout flag.
- Write visibility classification.

## Phase Completion Checklist
- [ ] Default runtime success exits 0 with dirty repository pending.
- [ ] Strict repository closeout exits 2 when dirty.
- [ ] Repository pending never changes runtime verdict.
- [ ] Result JSON includes `plannedWrites`, `publishWrites`, and `skippedWrites`.
- [ ] Strict no-diff scope excludes append-only logs.

## Handoff Notes
- Full verification should be run after Phase 05 so runtime parity classifier tests are included in the same regression sweep.
