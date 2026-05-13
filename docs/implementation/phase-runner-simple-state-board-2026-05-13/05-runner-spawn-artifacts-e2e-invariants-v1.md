# Phase 05: Runner Spawn Guard, Artifacts, and E2E Invariants (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | v5 / worker spawn hard reject | Do not spawn same-attempt worker after terminal state. | Guard runner active transition before worker launch. |
| REQ-5.2 | v5 / artifact preserve | Progress checkpoint must not turn blocked scorecard/STATE into active retry. | Harden artifact checkpoint writer. |
| REQ-5.3 | v5 / invariant and e2e | Cover blocked/running, complete/active, pending, stateRunId mismatch, and blocked loop prevention. | Add invariant and e2e tests. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-10 | REQ-5.1 | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` proves `STATE.md=blocked` same attempt aborts before `runWorkerPrompt`. |
| AC-11 | REQ-5.2 | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` proves blocked scorecard/STATE is not rewritten to retry/active by progress checkpoint. |
| AC-12 | REQ-5.3 | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` and `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` cover final regression matrix. |

## Goal
- Apply the state board guard at the runner and artifact edges where regressions can still escape after helper/projection work lands.

## Expected Outcome
- Worker spawn is hard rejected before a same-attempt terminal run can start another remediation worker.
- Artifact/progress updates preserve terminal handoff rather than manufacturing an active retry state.
- Invariant checker reports `STATE.md` and projection contradictions.
- E2E fixture proves `scorecard-verdict=blocked` remains terminal.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "01-simple-run-state-helper-v1"
    - "02-resume-cli-run-identity-guard-v1"
    - "03-projection-scrub-lease-heartbeat-guard-v1"
    - "04-terminal-publisher-reconciliation-intent-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.test.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
    - ".claude/scripts/blocker-closeout-prevention.e2e.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_regression_closeout"
```

## Scope
- In scope:
  - Insert hard reject guard in `updatePhaseState(...)` before active/running worker spawn.
  - Keep `recordPhaseProgressCheckpoint(...)` as no-op/preserve for terminal blocked state.
  - Harden `agent-loop-phase-artifacts.mjs` checkpoint behavior around blocked scorecards and `STATE.md`.
  - Add invariant checks for `STATE.md=blocked` plus running projection, `STATE.md=complete` plus active projection, pending projection status, and global `stateRunId` mismatch.
  - Extend blocker-closeout e2e to prove same-attempt remediation worker is not regenerated after `scorecard-verdict=blocked`.
- Out of scope:
  - New public commands.
  - Automatic recovery from pending transaction.
  - Run-scoped compatibility files as primary storage.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add runner hard reject | 1) Read state before active transition. 2) Reject pending/terminal same attempt. 3) Abort to handoff without calling worker. | Test spy proves `runWorkerPrompt` is not reached. |
| P05-2 | Harden artifact checkpoints | 1) Read scorecard and `STATE.md`. 2) Preserve terminal blocked fields. 3) Log no-op reason. | Artifact test proves no retry/active rewrite. |
| P05-3 | Add invariant cases | 1) Parse `STATE.md`. 2) Compare global projections. 3) Report named violation codes. | Invariant tests include all v5 contradiction cases. |
| P05-4 | Add e2e fixture | 1) Seed terminal blocked state. 2) Attempt same remediation path. 3) Assert handoff and no worker spawn. | e2e exits 0 and records regression evidence. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | `scorecard-verdict=blocked` stops the loop instead of creating another same attempt. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | e2e asserts terminal handoff and no equivalent remediation worker. | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |
| SCN-05-2 | Invariant checker reports contradictory board/projection state. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | violation codes for blocked/running, complete/active, pending, and stateRunId mismatch. | `.claude/scripts/lib/harness-state-invariants.test.mjs` |
| SCN-05-3 | Progress checkpoint cannot reclassify blocked state as retrying. | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | blocked scorecard/STATE remains terminal. | `.claude/scripts/agent-loop-phase-artifacts.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | exit 0; worker-spawn hard reject fixture passes |
| P05-2 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | `.claude/scripts/agent-loop-phase-artifacts.test.mjs` | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | exit 0; terminal preserve fixture passes |
| P05-3 | none | `.claude/scripts/lib/harness-state-invariants.mjs` | `.claude/scripts/lib/harness-state-invariants.test.mjs` | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | exit 0; contradiction fixtures pass |
| P05-4 | optional fixtures under `.claude/scripts/fixtures/blocker-closeout-prevention/` | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | same | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | exit 0; blocked loop prevention fixture passes |

## Blockers And Review
- Blocker condition: hard reject cannot abort before worker spawn without widening test seams in runner; add a tiny injectable runner helper instead of broad refactor.
- Review checkpoint: verify no-op/preserve paths cannot hide a real active transition request.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-2026-05-13/execution/v1/05-phase-05-runner-spawn-artifacts-e2e-invariants/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`
- [ ] `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- [ ] `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- [ ] `git diff --check`

## Deliverables
- Runner hard reject guard before worker spawn.
- Artifact checkpoint preserve guard.
- Invariant fixtures for board/projection contradictions.
- E2E blocked remediation loop prevention fixture.

## Phase Completion Checklist
- [ ] Same-attempt terminal state aborts before `runWorkerPrompt`.
- [ ] Progress checkpoint does not rewrite blocked state to active/retry.
- [ ] Invariant checker reports all v5 contradiction classes.
- [ ] E2E fixture proves `scorecard-verdict=blocked` is terminal.
