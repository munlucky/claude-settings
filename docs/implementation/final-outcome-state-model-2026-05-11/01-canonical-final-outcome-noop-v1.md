# Phase 01: Canonical Final Outcome And No-op Predicate (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.1 | AC-01 | Plan v8 / Schema marker | `phase-status.yaml` and workflow JSON need final outcome schema markers. | Add status/workflow marker write and fixture assertions. |
| REQ-1.2 | AC-02 | Plan v8 / Canonical State Contract | Legacy `complete` input is accepted but canonical output is `success | success_with_warning`. | Normalize final output while preserving `finalVerdict: complete`. |
| REQ-1.3 | AC-03 | Plan v8 / Predicate / canonical no-op | Final-complete and canonical no-op are separate checks. | Implement separate predicates and stale schema/hash rewrite reasons. |
| REQ-1.4 | AC-04 | Plan v8 / Idempotence scope | Strict no-diff target is limited to core status/workflow/summary files. | Add test fixture and result contract for strict no-diff scope. |

## Goal
- Make final complete detection tolerant of legacy completed inputs while making canonical no-op strict enough to rewrite stale markers, stale summary schema, and root counter mismatches.

## Expected Outcome
- `isFinalCompleteProjection({ statusRoot, phases })` recomputes actionable phases and returns true for legacy complete/success inputs when all actionable phases are done.
- `isCanonicalFinalCompleteProjection({ statusRoot, phases, workflowStates, summary })` returns true only when schema markers, counters, workflow JSON, and summary projection are canonical.
- Legacy `normalizedRunVerdict: complete` is rewritten to canonical `success` or `success_with_warning`.
- Canonical no-op finalizer execution leaves strict target files byte-identical and returns `idempotentNoop:true`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: ["02", "03", "04"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/scripts/lib/final-outcome-projection.test.mjs"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
    - ".claude/logs/agent-loop/summary.current.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_state_contract"
```

## Scope
- In scope:
  - Canonical schema marker write/read checks.
  - Final-complete predicate and canonical no-op predicate.
  - No-op result path that skips timestamp, `recoveredAt`, ledger, summary, and workflow rewrites.
  - Root counter and summary schema/hash stale reason classification.
- Out of scope:
  - Recovered blocker dedupe implementation beyond consuming its boolean warning signal.
  - Repository dirty handling.
  - Runtime parity harness changes.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md`
- Required code/data:
  - `.claude/scripts/phase-closeout-finalize.mjs`
  - `.claude/scripts/phase-closeout-finalize.test.mjs`
  - Representative fixtures containing legacy `normalizedRunVerdict: complete`, canonical `success`, and canonical `success_with_warning`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Extract predicate helpers | Create `lib/final-outcome-projection.mjs`; move/centralize final complete and canonical no-op logic. | Unit tests prove legacy complete is final-complete but not canonical no-op. |
| P01-2 | Add schema markers | Write `projectionSchemaVersion: "final-outcome-v1"` to status root and `finalOutcomeSchemaVersion: "1.0"` to workflow JSON outputs. | Finalized outputs contain markers in status and workflow JSON. |
| P01-3 | Add canonical rewrite reasons | Return `phase_counter_projection_mismatch` and `summary_projection_stale` when counters/hash/schema are stale. | Tests assert exact stale reason values. |
| P01-4 | Implement no-op fast path | At finalizer start, return existing result when strict canonical state is already complete. | Strict target files have no diff and JSON has `idempotentNoop:true`. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A finished run with legacy `complete` is repaired instead of silently skipped. | `node --test .claude/scripts/lib/final-outcome-projection.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | test asserts final-complete true, canonical no-op false, canonical verdict rewritten. | terminal test output |
| SCN-01-2 | Re-running finalizer on canonical final complete state produces no strict target diff. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | test asserts `idempotentNoop:true` and strict files unchanged. | terminal test output |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/final-outcome-projection.mjs`, `.claude/scripts/lib/final-outcome-projection.test.mjs` | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/lib/final-outcome-projection.test.mjs` | `node --test .claude/scripts/lib/final-outcome-projection.test.mjs` | Before implementation: missing module/test failure. After: all predicate cases pass. |
| P01-4 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/phase-closeout-finalize.test.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | No-op fixture returns `idempotentNoop:true` and no strict file diff. |

## Blockers And Review
- Blocker condition: no-op predicate depends only on `normalizedRunVerdict` string without recomputing actionable phases and schema/hash freshness.
- First review checkpoint: predicate API accepts normalized objects, not raw file text.
- Re-review trigger: any phase-status or workflow JSON write path bypasses schema marker normalization.
- Verification evidence path: terminal output from the targeted node tests.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/final-outcome-projection.test.mjs`
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Passing targeted tests.
- A fixture showing legacy `complete` rewritten to canonical output.
- A fixture showing canonical no-op strict no-diff behavior.

## Deliverables
- Final outcome projection helper.
- Finalizer no-op fast path.
- Schema marker and stale reason tests.

## Phase Completion Checklist
- [ ] Legacy `complete` is final-complete but not canonical no-op.
- [ ] Canonical outputs use `success | success_with_warning`, `finalVerdict: complete`, `scope_complete`, and `clean_complete`.
- [ ] Missing summary schema marker forces rewrite even when summary hash matches.
- [ ] Root counter mismatch emits `phase_counter_projection_mismatch`.
- [ ] Canonical no-op leaves strict target files unchanged.

## Handoff Notes
- Phase 02 should consume the helper's warning-history result instead of re-deriving final verdict strings.
