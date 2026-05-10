# Phase 01: Goal Contract Schema And Template (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-001 | User strategy Phase 1 | Add Seed-lite / Goal Contract before SPRINT_CONTRACT | Define schema, template, artifact path, and snapshot id |
| OHA-002 | User strategy Phase 1 | Capture objective, scope, non-goals, constraints, AC, exit conditions, brownfield context, provenance | Add contract fields and generation rules |
| OHA-012 | Core principles | Do not add new public entrypoints | Update existing plan-writer/phase-runner contract surfaces only |
| OHA-013 | Core principles | Connect docs to schema/template/verifier | Add verifier fixture and workflow evidence linkage |

## Goal

- Establish a local Seed-lite contract that freezes the product/request baseline before `SPRINT_CONTRACT.md` is generated.

## Expected Outcome

- Non-trivial phase packages can include a machine-readable `GOAL_CONTRACT.yaml` or embedded `goalContract` block.
- Contract snapshot id and provenance are available to plan-writer, phase-runner, QA_REPORT, and verifier verdicts.
- Chat history is no longer the only source for "what are we trying to finish?"

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02"
    - "03"
    - "04"
    - "05"
  ownedPaths:
    - ".claude/schemas/analysis-context.schema.yaml"
    - ".claude/templates/"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/01-goal-contract-schema-template-v1.md"
  readOnlyPaths:
    - ".claude/skills/moonshot-plan-writer/SKILL.md"
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/skills/completion-verifier/SKILL.md"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_contract"
```

## Scope

- In scope:
  - Define Goal Contract schema fields and defaults.
  - Add a template or generation target for `GOAL_CONTRACT.yaml`.
  - Add contract snapshot id and provenance to workflow evidence expectations.
  - Update plan generation so each plan package has a stable request baseline.
  - Add verifier checks for required Goal Contract fields.
- Out of scope:
  - Full Ouroboros Pydantic Seed port.
  - Runtime execution changes.
  - Semantic evaluation or event ledger implementation.

## Preconditions and Inputs

- Required docs:
  - `docs/implementation/ouroboros-harness-adoption-2026-05-10/00-master-plan-v1.md`
  - `docs/analysis/ouroboros-harness-adoption-inventory.md`
- Required code/data:
  - `.claude/schemas/analysis-context.schema.yaml`
  - `.claude/scripts/agent-loop-phase-plan-lib.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`
  - `.claude/verification.contract.yaml`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P01-1 | Define Goal Contract schema | Add `goalContract` with objective, scope, nonGoals, constraints, acceptanceCriteria, exitConditions, brownfieldContext, provenance, snapshotId | Schema validates a minimal and full fixture |
| P01-2 | Add contract template | Add or update a template used by plan-writer/phase prep | Template has no hidden chat-history dependency |
| P01-3 | Wire plan generation | Update phase plan generation to reference contract snapshot path/id | Generated plan package records contract path and snapshot id |
| P01-4 | Add enforcement hook | Add verifier/workflow-enforcement check for missing contract on non-trivial plans | Missing contract fails strict workflow-core verification |
| P01-5 | Record direct rejections | Document that full Seed runtime and new public commands are not part of this package | Master/phase docs keep stable public entrypoints |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P01-1 | A PRD/SPEC-driven plan has a frozen goal baseline before phase execution | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` plus a Goal Contract fixture test | Generated fixture includes `goalContract.snapshotId` | `QA_REPORT.md` for this phase |
| SCN-P01-2 | Strict verification rejects a non-trivial phase package without Goal Contract evidence | `bash .claude/scripts/workflow-enforcement.sh verify` with fixture or targeted self-test | Missing contract violation is reported | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P01-1 | `.claude/templates/GOAL_CONTRACT.template.yaml` or equivalent | `.claude/schemas/analysis-context.schema.yaml` | schema fixture | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` | Exit 0 |
| P01-2 | optional fixture under `.claude/docs/runtime-parity-reference-plan/` | `.claude/scripts/workflow-enforcement.mjs` | workflow fixture | `bash .claude/scripts/workflow-enforcement.sh verify` | Exit 0 or expected fixture violation |
| P01-3 | none | `.claude/verification.contract.yaml` | verification contract parser | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |

## Blockers And Review

- Blocker condition: Contract fields are prose-only and cannot be validated by schema or verifier.
- First review checkpoint: Review field names against existing `analysisContext` and workflow evidence vocabulary before wiring runner prompts.
- Re-review trigger: Any change that requires a new public skill or command.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/01-phase-01-goal-contract-schema-template-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs`
- [ ] `node --check .claude/scripts/workflow-enforcement.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`

## Evidence to Mark Done

- Goal Contract schema/template diff.
- Fixture or self-test proving snapshot id/provenance are emitted.
- Workflow-enforcement evidence that non-trivial plan packages require a Goal Contract.

## Deliverables

- Goal Contract schema or schema extension.
- Goal Contract template.
- Plan generation and verifier references to contract snapshot id.

## Phase Completion Checklist

- [ ] Goal Contract fields are schema-backed.
- [ ] Template exists or equivalent generator output is tested.
- [ ] Workflow evidence includes contract snapshot id/provenance.
- [ ] Strict verifier can detect missing Goal Contract for non-trivial plans.

## Handoff Notes

- Phase 02 consumes this contract to score ambiguity and extract ACs from PRD/SPEC sources.
