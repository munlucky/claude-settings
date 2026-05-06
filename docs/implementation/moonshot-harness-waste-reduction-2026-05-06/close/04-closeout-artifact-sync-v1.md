# Phase 04: Closeout Artifact Synchronization (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-011 | WASTE_REGISTER | Closeout fields synchronized through structured writer | Add idempotent closeout writer |
| MWR-012 | WASTE_REGISTER | Artifact-only patch churn reduced | Replace prompt-side artifact patching with script-side sync |

## Goal

- Make QA_REPORT, SCORECARD, and HANDOFF closeout fields move together through a structured, idempotent writer.

## Expected Outcome

- A phase cannot oscillate between `retry_loop` and `clean_finish` because markdown fields were updated partially or out of order.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn: ["01", "02"]
  conflictsWith: ["02", "05"]
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - ".claude/scripts/agent-loop-phase-plan.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/verification-verdict-state.mjs"
    - "docs/implementation/moonshot-harness-waste-reduction-2026-05-06/02-active-verdict-evidence-contract-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_artifacts"
```

## Scope

- In scope:
  - Add a structured closeout state writer for QA/SCORECARD/HANDOFF.
  - Ensure writer updates `Next path`, `Closeout reason`, `Verdict`, `Current score`, `Current task status`, review status, and evidence path together.
  - Update prompts to call the writer for artifact-only closeout changes.
- Out of scope:
  - Changing product scenario evidence requirements.

## Preconditions and Inputs

- Phase 02 complete.
- Existing files:
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P04-1 | Define closeout state model | Add normalized closeout fields and allowed values | Writer rejects inconsistent `retry_loop`/`scope_complete` combinations |
| P04-2 | Implement idempotent writer | Add function/CLI path to sync QA/SCORECARD/HANDOFF | Re-running writer produces no diff |
| P04-3 | Integrate completion gate | Use writer before clean finish and before retry handoff | Gate sees synchronized fields |
| P04-4 | Reduce artifact patch churn | Update phase attempt prompt to prefer writer over manual patch for closeout fields | Prompt no longer asks worker to patch routine closeout fields by hand |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P04-1 | Closeout fields cannot contradict each other | `node --test .claude/scripts/agent-loop-phase-plan.test.mjs` | inconsistent closeout fixture fails | `.claude/verification-verdict-phase04-closeout-sync.json` |
| SCN-P04-2 | Artifact sync is idempotent | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | second run has no diff | `.claude/logs/agent-loop/waste-ledger.jsonl` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P04-1 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | artifact self-test | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | RED: partial closeout accepted; GREEN: inconsistent state rejected |
| P04-2 | none | `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/agent-loop-phase-plan-lib.mjs` | workflow enforcement | `bash .claude/scripts/workflow-enforcement.sh verify` | GREEN: synchronized closeout passes |

## Blockers And Review

- Blocker condition: existing artifact templates cannot be updated without breaking completed phase readers.
- First review checkpoint: after P04-1, review allowed closeout field combinations.
- Re-review trigger: any change to `workflow-enforcement` completion semantics.
- Verification evidence path: `.claude/verification-verdict-phase04-closeout-sync.json`.

## Validation Plan

- [ ] Syntax checks: `node --check .claude/scripts/agent-loop-phase-artifacts.mjs && node --check .claude/scripts/workflow-enforcement.mjs`
- [ ] Behavior checks: `node --test .claude/scripts/agent-loop-phase-plan.test.mjs`
- [ ] Workflow checks: `bash .claude/scripts/workflow-enforcement.sh verify`

## Evidence to Mark Done

- Artifact self-test output.
- Workflow enforcement output.
- Example synchronized QA/SCORECARD/HANDOFF fixture.

## Deliverables

- Idempotent closeout artifact sync.

## Phase Completion Checklist

- [ ] Writer updates all closeout fields together
- [ ] Inconsistent closeout fixture fails
- [ ] Prompt no longer requires manual patching for routine closeout sync

## Handoff Notes

- Phase 05 can record closeout sync repairs as waste ledger events.

