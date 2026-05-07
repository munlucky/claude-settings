# Phase 04: Structured Artifact Writer Expansion (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-001 | User overhead item 1 | closeout/bookkeeping gaps should not relaunch full implementation workers | Add writer-only remediation path |
| HWO-002 | User overhead item 2 | repeated markdown `apply_patch` failures must be replaced by structured writers | Expand idempotent artifact writer coverage |
| HWO-009 | User overhead item 9 | QA/SCORECARD/HANDOFF/WORKSETS bookkeeping must not dominate worker time | Add single structured artifact sync entrypoint |
| HWO-010 | Prior MWR-011/MWR-012 | closeout fields synchronized by writer and patch churn reduced | Extend existing closeout writer pattern |

## Goal

- Move phase artifact bookkeeping from LLM manual patching to deterministic, idempotent writer commands.

## Expected Outcome

- Review-only and finish-closeout-only gaps are remediated without launching a new broad implementation worker.
- QA_REPORT.md, SCORECARD.md, HANDOFF.md, and WORKSETS.yaml section updates are idempotent.
- Worker prompts can instruct use of a structured writer command instead of hand-patching long markdown artifacts.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn:
    - "01"
  conflictsWith:
    - "05"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/templates/execution/"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope

- In scope:
  - Add or extend a single `sync-phase-artifacts` style command that accepts structured state and updates QA/SCORECARD/HANDOFF/WORKSETS.
  - Keep current `sync-closeout-artifacts`, `complete-review-closeout-from-verdict`, and `sync-clean-finish-artifacts` backward compatible.
  - Ensure writers can update review evidence, finish readiness, runtime updates, score payload, handoff marker, and active atomic task evidence.
  - Add idempotence tests that run the same writer twice and compare output.
- Out of scope:
  - Replacing every historical markdown artifact.
  - Changing score target or completion criteria.
  - Changing `phase-status.yaml` rebuild logic.

## Preconditions And Inputs

- Phase 01 verdict placeholder semantics are stable.
- Required current code:
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`
  - `.claude/scripts/agent-loop-phase-plan-lib.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P04-1 | Define structured artifact state | Define minimal JSON fields for stage, status, verdict path, review state, finish state, score, commands, changed files, and log path | Writer input has no ambiguous markdown prose dependency |
| P04-2 | Implement writer command | Add command that updates QA/SCORECARD/HANDOFF/WORKSETS through section replacement | Same input is idempotent |
| P04-3 | Update prompt instructions | Replace hand-patch guidance with writer command for artifact-only updates | Codex direct checklist names the writer path |
| P04-4 | Preserve existing commands | Keep old writer commands working for current runner callers | Existing artifact self-test passes |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P04-1 | Closeout-only missing fields are repaired without implementation worker | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` plus added fixture | writer-only fixture reaches stable clean-finish sections | `QA_REPORT.md` self-test output |
| SCN-P04-2 | Long markdown artifact patch churn is avoided | writer idempotence fixture | second writer run produces identical files | `QA_REPORT.md` fixture output |
| SCN-P04-3 | WORKSETS evidence is updated from structured verdict | writer fixture with changed files and commands | `ownedPaths`, `verificationCommands`, and `evidence` update consistently | `QA_REPORT.md` fixture output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P04-1 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | self-test temp files | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | Exit 0; idempotent output |
| P04-2 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | same | `node --check .claude/scripts/agent-loop-phase-artifacts.mjs` | Exit 0 |
| P04-3 | none | `.claude/scripts/agent-loop-phase-plan-lib.mjs` | prompt text inspection | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` | Exit 0; prompt references writer |
| P04-4 | none | existing artifacts commands | self-test | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | Existing command behavior preserved |

## Blockers And Review

- Blocker condition: Writer removes user-authored evidence outside the intended sections.
- First review checkpoint: Review structured input fields and section ownership before integrating with runner.
- Re-review trigger: Any new writer command changes HANDOFF stop reason vocabulary or SCORECARD verdict semantics.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/04-phase-04-structured-artifact-writer-expansion-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-artifacts.mjs`
- [ ] `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test`
- [ ] `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`

## Evidence To Mark Done

- Idempotence fixture output.
- Diff summary showing only artifact-writer/prompt instruction changes.
- Closeout test output.

## Deliverables

- Expanded structured artifact writer.
- Prompt guidance that uses writer commands instead of manual artifact patching.
- Idempotence regression coverage.

## Phase Completion Checklist

- [ ] Writer covers review, finish, runtime, score, handoff, and workset evidence.
- [ ] Writer is idempotent.
- [ ] Existing artifact commands remain compatible.
- [ ] Closeout tests pass.

## Handoff Notes

- Phase 05 must route review/finish closeout-only gate reasons through this writer-only path.
