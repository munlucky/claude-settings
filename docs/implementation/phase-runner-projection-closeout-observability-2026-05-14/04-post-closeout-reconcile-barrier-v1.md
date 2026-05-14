# Phase 04: Post Closeout Reconcile Barrier

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-reconcile"
  dependsOn:
    - "01-projection-vocabulary-canonicalization-v1.md"
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "03-phase-status-and-final-git-reconciliation-v1.md"
  conflictsWith:
    - "01-projection-vocabulary-canonicalization-v1.md"
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "03-phase-status-and-final-git-reconciliation-v1.md"
    - "06-runner-bottleneck-telemetry-v1.md"
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/phase-closeout-reconciler.mjs"
    - ".claude/scripts/phase-closeout-reconciler.test.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/STATE.md"
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-9: no final barrier reconciles all closeout read models together.
- AC-5: post-closeout reconcile barrier fails on remaining split-brain.

## Goal

Add a final closeout read-model barrier that validates the state board, phase status, current run, active run, and latest dispatch as one coherent terminal state.

## Scope

Integrate existing invariant checks into closeout finalization. Do not create a new canonical store.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add fixture with consistent individual files but inconsistent combined closeout state. | closeout finalizer/reconciler tests | Current closeout misses it. |
| T2 | Run invariant evaluation after final projection writes and before clean closeout success is returned. | closeout finalizer/reconciler | Inconsistent state blocks clean closeout. |
| T3 | Ensure successful reconcile writes no speculative repair unless the invariant result is clean. | closeout tests | No silent mutation on invalid state. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-07 | Split-brain across workflow read models blocks final closeout. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | closeout returns violation. | QA_REPORT.md |
| SCN-08 | Clean terminal projections pass final barrier. | same command | no violation. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/phase-closeout-finalize.test.mjs
node --test .claude/scripts/phase-closeout-reconciler.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/verify-phase-closeout.test.mjs
git diff --check
```

## Blocker Condition

Stop if the barrier would require mutating runtime files during a read-only verifier. Split validation and repair into separate helpers.

## Deliverables

- Final post-closeout invariant gate.
- Fixture coverage for combined read-model split-brain.

## Phase Completion Checklist

- [ ] Combined split-brain fixture fails.
- [ ] Clean terminal fixture passes.
- [ ] Barrier does not silently repair invalid state.
