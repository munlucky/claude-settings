# Phase 03: Summary Projection Schema And Read-only Writer (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.1 | AC-01 | Plan v8 / Schema marker | Summary projection needs `summaryProjectionSchemaVersion: "1.0"`. | Add marker and stale marker rewrite tests. |
| REQ-1.7 | AC-07 | Plan v8 / Summary projection | Summary writer is read-only and does not mutate status/workflow files. | Add `phase-summary-projection.mjs` and route summary generation through it. |

## Goal
- Make `summary.current.md` a deterministic read-only projection of canonical state, with explicit schema freshness and no source-state side effects.

## Expected Outcome
- Final complete state renders `Completed N / Failed 0 / State completed`.
- Historical warning renders text equivalent to `Runtime completed with historical warnings` and does not imply active failure.
- Repository pending still renders runtime `State: completed`.
- Summary writer does not modify `phase-status.yaml`, `current-run.json`, `active-phase-run.json`, or `latest-dispatch.json`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn: ["01", "02"]
  conflictsWith: ["04"]
  ownedPaths:
    - ".claude/scripts/lib/phase-summary-projection.mjs"
    - ".claude/scripts/lib/phase-summary-projection.test.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_summary_projection"
```

## Scope
- In scope:
  - New read-only summary projection library.
  - Summary schema marker detection and rewrite trigger.
  - Active failed count derived from active blockers, not historical warning arrays.
  - Repository pending represented separately from runtime state.
- Out of scope:
  - Markdown style redesign.
  - Status/workflow writer changes unrelated to summary projection inputs.

## Preconditions and Inputs
- Phase 01 canonical final outcome helper exists.
- Phase 02 warning/recovered blocker arrays are stable.
- Summary fixtures include clean success, success with historical warnings, and repository pending.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add summary projection lib | Create `lib/phase-summary-projection.mjs` with pure input/output functions. | Unit tests can render summary without touching source files. |
| P03-2 | Add schema marker | Include `summaryProjectionSchemaVersion: "1.0"` in summary metadata/front matter or stable marker line. | Missing marker makes finalizer treat summary as stale even if hash matches. |
| P03-3 | Fix final complete summary counts | Ensure final complete has failed count zero even with warning history. | Tests assert `Completed 8`, `Failed 0`, and `State completed`. |
| P03-4 | Enforce read-only source behavior | Add fixture that snapshots source files before/after summary write. | Summary writer modifies only `summary.current.md` in this phase. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | Completed run with historical warning is visibly complete, not failed. | `node --test .claude/scripts/lib/phase-summary-projection.test.mjs` | output includes completed state, failed zero, and historical warning wording. | terminal test output |
| SCN-03-2 | Repository pending does not downgrade runtime state. | `node --test .claude/scripts/lib/phase-summary-projection.test.mjs` | output keeps `State completed` with repository pending closeout section. | terminal test output |
| SCN-03-3 | Summary writer does not mutate source state. | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | source snapshots unchanged. | terminal test output |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | `.claude/scripts/lib/phase-summary-projection.mjs`, `.claude/scripts/lib/phase-summary-projection.test.mjs` | `.claude/scripts/agent-loop-phase-artifacts.mjs` | `.claude/scripts/lib/phase-summary-projection.test.mjs` | `node --test .claude/scripts/lib/phase-summary-projection.test.mjs` | Pure projection tests pass. |
| P03-4 | none | `.claude/scripts/agent-loop-phase-artifacts.test.mjs`, `.claude/scripts/phase-closeout-finalize.test.mjs` | same | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | Summary marker stale rewrite and source read-only tests pass. |

## Blockers And Review
- Blocker condition: summary generation calls status/workflow write helpers.
- First review checkpoint: summary projection input object includes repository closeout as separate field.
- Re-review trigger: historical warnings increase active failed count.
- Verification evidence path: targeted summary and artifact tests.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-summary-projection.test.mjs`
- [ ] `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Passing pure projection tests.
- Fixture output with `Completed 8`, `Failed 0`, `State completed`.
- Source file snapshot/no-mutation assertion.

## Deliverables
- `phase-summary-projection.mjs`.
- Summary schema marker.
- Read-only summary writer tests.

## Phase Completion Checklist
- [ ] Summary projection has schema version `1.0`.
- [ ] Missing summary schema marker triggers rewrite.
- [ ] Historical warnings do not create active failure counts.
- [ ] Repository pending keeps runtime state completed.
- [ ] Summary writer is read-only with respect to source state files.

## Handoff Notes
- Phase 04 should include summary writes in `plannedWrites/publishWrites/skippedWrites` visibility without broadening strict no-diff scope.
