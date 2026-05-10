# Phase 03: AC-linked WORKSETS And Artifact Projection (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-005 | User strategy Phase 3 | Upgrade WORKSETS to AC tracking units | Extend workset schema and generator |
| OHA-013 | Core principles | Connect docs rules to scripts and verifier | Update artifact writer and closeout parser |

## Goal

- Extend `WORKSETS.yaml` so each atomic task can point to one or more acceptance criteria and carry evidence required for AC verdicts.

## Expected Outcome

- Phase-runner still executes one active atomic task at a time.
- WORKSETS can express `taskStatus` separately from `acVerdict`.
- QA_REPORT/SCORECARD/HANDOFF projections include AC evidence without manual markdown patch churn.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01"
    - "02"
  conflictsWith:
    - "04"
    - "05"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.mjs"
    - ".claude/scripts/phase-worktree-coordinator.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/03-ac-linked-worksets-artifact-projection-v1.md"
  readOnlyPaths:
    - ".claude/verification.contract.yaml"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_artifact_contract"
```

## Scope

- In scope:
  - Add optional `acceptanceCriterionId`, `parentAcceptanceCriterionId`, `linkedRequirementIds`, `taskStatus`, `acVerdict`, `verificationEvidence`, `semanticEvaluation`.
  - Keep backward compatibility with existing `AT-*` WORKSETS.
  - Update artifact writer so verdict/evidence sync can populate AC-linked fields.
  - Update phase closeout parsing to understand incomplete AC verdicts.
- Out of scope:
  - Replacing phase docs with AC tree docs.
  - Running semantic evaluation.
  - Migrating historical execution artifacts.

## Preconditions and Inputs

- Phase 01 contract fields exist.
- Phase 02 can produce AC ids or records why AC linkage is unavailable.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P03-1 | Define extended WORKSETS shape | Add compatible optional fields and examples | Existing WORKSETS fixtures still parse |
| P03-2 | Update renderer | Emit AC-linked fields when source AC ids are available | New generated WORKSETS include AC linkage |
| P03-3 | Update artifact writer | Sync evidence and verdict payload into WORKSETS AC fields | Writer remains idempotent |
| P03-4 | Update closeout parser | Detect incomplete AC verdict separately from incomplete task | Closeout violation uses a distinct code |
| P03-5 | Update tests | Add legacy and AC-linked fixtures | Regression tests pass |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P03-1 | A generated workset links task work to source ACs | `node .claude/scripts/verify-phase-closeout.mjs self-test` | AC-linked fixture parses and validates | `QA_REPORT.md` for this phase |
| SCN-P03-2 | Existing legacy worksets still close out correctly | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Legacy fixture remains green | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P03-1 | optional test fixture | `.claude/scripts/agent-loop-phase-plan-lib.mjs` | renderer fixture | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` | Exit 0 |
| P03-2 | optional test fixture | `.claude/scripts/agent-loop-phase-artifacts.mjs` | writer self-test | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | Exit 0 |
| P03-3 | optional test fixture | `.claude/scripts/lib/phase-closeout-artifacts.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs` | closeout tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: AC-linked fields break existing phase-runner "one activeAtomicTask" behavior.
- First review checkpoint: Review backward compatibility and writer idempotence before closeout parser changes.
- Re-review trigger: Any change to `phase-worktree-coordinator` merge semantics.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/03-phase-03-ac-linked-worksets-artifact-projection-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-artifacts.mjs`
- [ ] `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`

## Evidence to Mark Done

- Legacy and AC-linked workset fixture output.
- Closeout parser test evidence.
- Artifact writer idempotence evidence.

## Deliverables

- Backward-compatible AC-linked WORKSETS schema.
- Renderer/writer/parser updates.
- Regression fixtures.

## Phase Completion Checklist

- [ ] AC-linked fields are generated when available.
- [ ] Legacy WORKSETS remain supported.
- [ ] Artifact writer updates AC evidence idempotently.
- [ ] Closeout can distinguish incomplete task from incomplete AC verdict.

## Handoff Notes

- Phase 04 consumes the task/ac split to update completion verifier policy.
