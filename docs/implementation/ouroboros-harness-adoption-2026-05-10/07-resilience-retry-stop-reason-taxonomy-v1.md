# Phase 07: Resilience Retry And Stop-reason Taxonomy (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-009 | User strategy Phase 6 | Add stagnation patterns, stop reason split, recovery action, timeout split | Update retry/failure taxonomy and runner state |
| OHA-014 | Additional improvements | Add unstuck route and execution-vs-evaluation guide | Route repeated non-progress to replan/unstuck |

## Goal

- Replace blind retry with named non-progress patterns, bounded retry budgets, and precise raw-vs-normalized outcome fields.

## Expected Outcome

- Repeated failures are classified as spinning, oscillation, no_drift, diminishing_returns, provider/environment failure, or product/contract failure.
- Raw runtime exits remain separate from recovered success and normalized verdict.
- Total run timeout and per-iteration timeout are tracked separately.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-6"
  dependsOn:
    - "05"
    - "06"
  conflictsWith:
    - "08"
  ownedPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/skills/failure-analyzer/SKILL.md"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/07-resilience-retry-stop-reason-taxonomy-v1.md"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "conditional_parallel_disjoint_patch"
```

## Scope

- In scope:
  - Add stagnation pattern classifier.
  - Add `rawStopReason`, `recoveryAction`, `normalizedRunVerdict`, `stopReasonClass`.
  - Add total timeout vs per-iteration timeout fields.
  - Add retry budget and no-progress stop behavior.
  - Add unstuck/replan route for repeated non-progress.
- Out of scope:
  - Full Ralph loop port.
  - Persona-driven automatic rewrites.
  - Infinite recursive improvement.

## Preconditions and Inputs

- Phase 05 event ledger is available or has a minimal event sequence for retry history.
- Phase 06 trigger vocabulary can distinguish deterministic, semantic, and environment failures.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P07-1 | Define stagnation classifier | Implement or document detection for spinning, oscillation, no_drift, diminishing_returns | Fixtures classify repeated failures correctly |
| P07-2 | Split stop reasons | Preserve raw runtime exit, recovery action, and normalized verdict separately | Current-run/phase-status no longer collapse recovered success |
| P07-3 | Add timeout split | Track total run and per-iteration budgets | Timeout reports identify which budget expired |
| P07-4 | Add retry policy | Route deterministic, semantic, provider, environment, and no-progress failures differently | Retry stops with stable handoff when no progress |
| P07-5 | Add unstuck route | Link repeated non-progress to assumption/replan review | Blind retry is suppressed after threshold |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P07-1 | Repeated identical failures do not launch endless retries | unit test for classifier | `spinning` detected and retry suppressed | `QA_REPORT.md` for this phase |
| SCN-P07-2 | Provider failure recovered by local fallback is not reported as clean delegated success | state normalization fixture | raw stop and recovered verdict remain separate | `QA_REPORT.md` for this phase |
| SCN-P07-3 | Per-iteration timeout is distinct from total timeout | timeout fixture | correct timeout field and stop class | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P07-1 | test file under `.claude/scripts/lib/` as needed | `.claude/scripts/lib/failure-classifier.mjs` | classifier tests | `node --test .claude/scripts/lib/*.test.mjs` | Relevant tests exit 0 |
| P07-2 | optional fixture | `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/workflow-enforcement.mjs` | state tests | `node --check .claude/scripts/agent-loop-phase-state.mjs` | Exit 0 |
| P07-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | runner syntax/test | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: Retry policy suppresses a valid fix-forward attempt after a single transient failure.
- First review checkpoint: Review thresholds and failure classes before wiring to runner loop.
- Re-review trigger: Any change to final Git closeout or checkpoint commit semantics.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/07-phase-07-resilience-retry-stop-reason-taxonomy-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-state.mjs`
- [ ] `node --test .claude/scripts/lib/*.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`

## Evidence to Mark Done

- Classifier test output.
- State normalization fixture.
- Retry policy documentation.

## Deliverables

- Stagnation classifier or taxonomy extension.
- Stop reason split in state artifacts.
- Retry/unstuck routing rules.

## Phase Completion Checklist

- [ ] Stagnation patterns are named and testable.
- [ ] Raw stop reason and normalized verdict are separate.
- [ ] Timeout fields distinguish total and per-iteration budgets.
- [ ] Repeated non-progress routes to handoff/replan instead of blind retry.

## Handoff Notes

- Phase 08 exposes these fields through status, resume, and runtime capability projections.
