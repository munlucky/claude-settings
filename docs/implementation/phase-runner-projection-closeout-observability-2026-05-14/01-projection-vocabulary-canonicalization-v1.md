# Phase 01: Projection Vocabulary Canonicalization

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "projection-core"
  dependsOn: []
  conflictsWith:
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "03-phase-status-and-final-git-reconciliation-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  ownedPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-1: terminal projections contain mixed `completed`, `complete`, `failed`, and `in_progress` vocabulary.
- AC-1: terminal projections have one canonical terminal vocabulary.

## Goal

Define and enforce one terminal projection vocabulary for `current-run.json` and `active-phase-run.json`.

Fixed terminal vocabulary:

| Projection file | Complete terminal fields | Failed terminal fields | Forbidden stale fields after terminal complete |
| --- | --- | --- | --- |
| `current-run.json` | `status: "completed"`, `completionStatus: "completed"`, `finalVerdict: "complete"`, `childAlive: false` | `status: "failed"`, `completionStatus: "failed"`, `finalVerdict: "failed"`, `childAlive: false` | `status: "complete"`, `status: "finished"`, `activeExecutionStatus: "failed"`, `activeExecutionStatus: "running"`, `activeExecutionStatus: "in_progress"`, `attemptOutcome: "in_progress"`, `childAlive: true` |
| `active-phase-run.json` | `status: "finished"`, `completionStatus: "completed"`, `finalVerdict: "complete"`, `childAlive: false` | `status: "failed"`, `completionStatus: "failed"`, `finalVerdict: "failed"`, `childAlive: false` | `status: "completed"`, `status: "complete"`, `activeExecutionStatus: "failed"`, `activeExecutionStatus: "running"`, `activeExecutionStatus: "in_progress"`, `attemptOutcome: "in_progress"`, `childAlive: true` |

`attemptOutcome` may be absent on terminal complete. If present, it must be `completed` for complete terminal projections and `failed` for failed terminal projections. `activeExecutionStatus` may be absent on terminal complete. If present, it must match `completionStatus`. A failed terminal shape must never coexist with `finalVerdict: "complete"`.

## Scope

Modify only the shared scrub/projection boundaries. Do not change runner orchestration logic in this phase.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add failing tests for complete projection with stale `failed` and `in_progress` fields. | lifecycle and lease store tests | Tests reproduce the split-brain payload. |
| T2 | Update terminal scrub logic to clear stale failure/running fields on complete. | `simple-run-state.mjs`, projection writers | Tests pass. |
| T3 | Add negative tests proving failed projection cannot keep `finalVerdict=complete`. | lifecycle test | Invalid mix is rejected or scrubbed. |
| T4 | Run focused suites. | commands below | All pass. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-01 | Complete projection removes stale `activeExecutionStatus=failed`. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | projection has no failed field after complete scrub. | QA_REPORT.md |
| SCN-02 | Active lease heartbeat cannot preserve `attemptOutcome=in_progress` after terminal complete. | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` | terminal projection remains terminal. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs
node --test .claude/scripts/lib/phase-run-lease-store.test.mjs
node --test .claude/scripts/lib/simple-run-state.test.mjs
git diff --check
```

## Blocker Condition

Stop if an existing consumer requires `activeExecutionStatus=failed` together with `finalVerdict=complete`; document the consumer and split the vocabulary table before patching.

## Deliverables

- Terminal vocabulary table encoded in tests.
- Scrub logic that produces consistent complete and failed projections.

## Phase Completion Checklist

- [ ] Red tests reproduce projection split-brain.
- [ ] Terminal complete scrub removes stale failure/running fields.
- [ ] Focused suites pass.
