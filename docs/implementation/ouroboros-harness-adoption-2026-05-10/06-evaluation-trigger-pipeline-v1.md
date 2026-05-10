# Phase 06: Evaluation Trigger Pipeline (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-008 | User strategy Phase 5 | Absorb mechanical -> semantic -> consensus pipeline into strict verifier | Add deterministic-first trigger policy |
| OHA-014 | Additional improvements | Add verification override allowlist and QA backend matrix | Add safe override and backend availability checks |

## Goal

- Add Ouroboros-style evaluation staging without weakening Moonshot strict verification or running LLM review unnecessarily.

## Expected Outcome

- Mechanical checks remain first and deterministic.
- Semantic evaluation is required only when explicit triggers occur.
- Consensus is an exceptional high-risk path, not a default.
- Skipped mechanical checks become explicit warnings or blockers depending on validation profile.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-6"
  dependsOn:
    - "04"
    - "05"
  conflictsWith:
    - "08"
  ownedPaths:
    - ".claude/skills/completion-verifier/SKILL.md"
    - ".claude/skills/codex-review-code/SKILL.md"
    - ".claude/skills/verification-evidence-gate/SKILL.md"
    - ".claude/verification.contract.yaml"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/06-evaluation-trigger-pipeline-v1.md"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "conditional_parallel_disjoint_patch"
```

## Scope

- In scope:
  - Define semantic evaluation triggers: AC ambiguity, scope drift, architecture/security/auth/payment risk, repeated failure, tests passing but user value unclear.
  - Define consensus triggers: contract reinterpretation, high-risk security/architecture drift, unresolved evaluator disagreement.
  - Add mechanical skip semantics by validation profile.
  - Add project verification override allowlist.
  - Add QA backend matrix for browser/a11y/visual/performance evidence.
- Out of scope:
  - Building a multi-model service.
  - Running LLM semantic review for every phase.
  - Relaxing deterministic check requirements.

## Preconditions and Inputs

- Phase 04 provides task/ac verdict split.
- Phase 05 provides event context and drift lineage.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P06-1 | Define trigger vocabulary | Add semantic/consensus trigger fields to verifier evidence | Triggers are visible in QA/verdict |
| P06-2 | Enforce deterministic-first gate | Ensure mechanical failure blocks semantic pass | Tests or fixtures prove short-circuit |
| P06-3 | Add skip policy | Encode skipped check behavior by validation profile | Strict profiles block silent skips |
| P06-4 | Add override allowlist | Allow project-native commands only through explicit trusted config | Unknown executable is blocked or warned |
| P06-5 | Add QA backend matrix | Record backend availability and required evidence | Missing required backend routes to blocker/degraded evidence |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P06-1 | Mechanical failure blocks clean semantic pass | targeted verifier fixture | Semantic/consensus not treated as override | `QA_REPORT.md` for this phase |
| SCN-P06-2 | Scope drift triggers semantic review | verifier fixture with drift event | `semanticEvaluation.required=true` with trigger reason | `QA_REPORT.md` for this phase |
| SCN-P06-3 | Missing required browser/a11y/visual backend is not clean pass | workflow/closeout fixture | Missing backend recorded as blocker or degraded evidence | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P06-1 | optional guideline | `.claude/skills/completion-verifier/SKILL.md`, `.claude/verification.contract.yaml` | knowledge audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |
| P06-2 | test fixture | `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/verify-phase-closeout.mjs` | closeout/workflow tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |
| P06-3 | optional config doc | `.claude/verification.contract.yaml` | workflow verify | `bash .claude/scripts/workflow-enforcement.sh verify` | Exit 0 |

## Blockers And Review

- Blocker condition: Semantic or consensus review can turn a deterministic failure into clean finish.
- First review checkpoint: Review trigger vocabulary with completion-verifier before implementation.
- Re-review trigger: Any new validation profile or check skip behavior.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/06-phase-06-evaluation-trigger-pipeline-v1/QA_REPORT.md`

## Validation Plan

- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`

## Evidence to Mark Done

- Trigger fixture output.
- Mechanical skip policy evidence.
- QA backend matrix documentation and verifier result.

## Deliverables

- Evaluation trigger contract.
- Mechanical skip policy.
- Verification override allowlist and QA backend matrix.

## Phase Completion Checklist

- [ ] Mechanical-first gate is preserved.
- [ ] Semantic review has explicit trigger reasons.
- [ ] Consensus is exceptional and gated.
- [ ] Skipped checks are never silent clean pass in strict profiles.

## Handoff Notes

- Phase 07 should use trigger and event outcomes to classify retry/stagnation behavior.
