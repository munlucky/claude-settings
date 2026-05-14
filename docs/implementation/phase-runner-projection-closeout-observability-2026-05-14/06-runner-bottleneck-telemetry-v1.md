# Phase 06: Runner Bottleneck Telemetry

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "telemetry"
  dependsOn:
    - "01-projection-vocabulary-canonicalization-v1.md"
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "03-phase-status-and-final-git-reconciliation-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  conflictsWith:
    - "03-phase-status-and-final-git-reconciliation-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.test.mjs"
    - ".claude/scripts/lib/phase-attempt-telemetry.mjs"
    - ".claude/scripts/lib/phase-attempt-telemetry.test.mjs"
    - ".claude/scripts/meta-harness-trace.mjs"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-7: narrow phase fixes can take about ten minutes without clear ownership of the time.
- REQ-8: verification work can leave `verificationSeconds=0`.
- AC-8, AC-9.

## Goal

Make runner timing explainable enough to diagnose whether time was spent in worker startup, worker active execution, verification, closeout, idle wait, or runtime dependency fallback.

## Scope

Patch timing capture and reporting only. Do not change worker model or phase-runner scheduling policy in this phase.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add test fixture where verification commands run but `verificationSeconds=0`. | state/telemetry tests | Current timing remains zero. |
| T2 | Track verifier start/end around actual verification command execution. | runner/state telemetry | verificationSeconds becomes positive. |
| T3 | Add closeout and idle/wait buckets to telemetry summary. | telemetry/meta trace | wall time decomposes into named buckets. |
| T4 | Add overhead regression threshold fixture for narrow no-op/focused phase paths. | telemetry test | Warning emitted when overhead exceeds threshold. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-12 | Verification command time is counted. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs` | `verificationSeconds > 0`. | QA_REPORT.md |
| SCN-13 | Trace summary explains wall-clock ownership. | `node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs` | buckets sum within tolerance. | QA_REPORT.md |
| SCN-14 | Slow narrow phase emits bottleneck warning. | focused telemetry test | warning identifies dominant bucket. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/agent-loop-phase-state.test.mjs
node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs
node --test .claude/scripts/lib/harness-overhead-regression.test.mjs
git diff --check
```

## Blocker Condition

Stop if verification timing cannot be captured without wrapping every shell command. Add a narrow timing helper around existing verification command invocation instead of broad shell instrumentation.

## Deliverables

- Non-zero verification timing when verification runs.
- Timing bucket summary suitable for bottleneck review.
- Regression warning for unexpectedly slow narrow phases.

## Phase Completion Checklist

- [ ] VerificationSeconds no longer remains zero after verification command execution.
- [ ] Wall-clock timing is decomposed into named buckets.
- [ ] Focused telemetry tests pass.
