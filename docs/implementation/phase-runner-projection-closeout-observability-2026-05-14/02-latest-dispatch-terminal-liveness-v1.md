# Phase 02: Latest Dispatch Terminal Liveness

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "projection-core"
  dependsOn:
    - "01-projection-vocabulary-canonicalization-v1.md"
  conflictsWith:
    - "01-projection-vocabulary-canonicalization-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-2: terminal `latest-dispatch.json` can retain `child_running` and `childAlive=true`.
- AC-2: terminal or superseded dispatch projections scrub live child fields.

## Goal

Make `latest-dispatch.json` terminal states unambiguous. A terminal or superseded dispatch must not look alive.

Terminal dispatch shape:

- `dispatchStage: "terminal"` or another terminal-specific value, never `child_running`
- `childAlive: false`
- `liveness.childAlive: false`
- no stale progress reason that implies a live child

## Scope

Patch dispatch lifecycle close/update boundaries and invariant coverage. Do not change child process execution.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add failing fixture for `status=superseded`, `completionStatus=completed`, `dispatchStage=child_running`, `childAlive=true`. | dispatch/invariant tests | Fixture currently passes or remains stale. |
| T2 | Update terminal dispatch close path to scrub liveness. | `moonshot-phase-dispatch.mjs` | Terminal close writes childAlive false. |
| T3 | Add invariant violation for terminal dispatch with live child fields. | invariant module | Violation code is stable. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-03 | Completed/superseded latest dispatch cannot remain child-running. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | liveness is false and dispatchStage is terminal. | QA_REPORT.md |
| SCN-04 | Invariants catch stale live latest-dispatch. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | violation code emitted. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/moonshot-phase-dispatch.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/verify-phase-closeout.test.mjs
git diff --check
```

## Blocker Condition

Stop if terminal latest-dispatch has multiple valid terminal stage vocabularies in current tests. Record the accepted vocabulary before implementing.

## Deliverables

- Terminal liveness scrub for latest dispatch.
- Invariant test preventing regression.

## Phase Completion Checklist

- [ ] Red test reproduces stale liveness.
- [ ] Terminal dispatch scrub writes dead liveness.
- [ ] Closeout and invariant tests pass.
