# Phase 05: Eval Failure and Procedural Memory Candidates v1

## Goal

Connect eval replay, failure classes, and replan history to memory candidates without auto-promoting new procedures. The output of this phase is a reviewed candidate loop, not durable memory by default.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-004 | uploaded research section 5 | Replan should use failure class and prior attempts. | Add failure-memory replan fixtures. |
| REQ-MEM-005 | uploaded research sections 6, 8 | Memory quality and failure memory should affect score/replan. | Feed eval and failure facts into candidates. |
| REQ-MEM-007 | existing Phase 09 | Procedural memory must pass evidence/review/replay/rollback gates. | Keep candidate status until promotion gates pass. |

## Expected Outcome

- Eval fixtures for stale suppression, candidate suppression, provenance, repeated failure, and changed approach.
- A failure-memory candidate contract that records `failure_class`, root cause, observed command/test evidence, attempted fix, and next replan delta.
- A procedural-memory candidate rule: "always do X" can become a hook/rule/skill only through explicit promotion gates.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "02-evidence-episode-ledger-v1.ko.md"
    - "03-stage-scoped-retrieval-and-context-packs-v1.ko.md"
    - "04-task-evidence-graph-ontology-verify-gates-v1.ko.md"
  conflictsWith:
    - "Any automatic procedural memory promotion from a single failure."
  ownedPaths:
    - "planned: schemas/failure-memory-candidate.schema.json"
    - "planned: tools/evals/fixtures/harness-control-plane/memory-control-plane-*.json"
    - "planned: tests/eval-regression-contract.test.mjs"
    - "planned: tests/fixtures/harness-control-plane/failure-memory/**"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md"
  readOnlyPaths:
    - "scripts/awtl-memory-promotion.mjs"
    - "scripts/lib/awtl-memory-promotion.mjs"
    - "schemas/memory-promotion-ledger.schema.json"
    - "raw eval traces"
  sharedMutablePaths:
    - "tools/evals/harness-control-plane.mjs"
    - "tests/eval-regression-contract.test.mjs"
  conditionalOwnedPathsAfterEvalPolicy:
    - "tools/evals/harness-control-plane.mjs"
    - "tests/eval-regression-contract.test.mjs"
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "package.json"
      requiredEvidenceSlots:
        - "targeted_tests"
        - "independent_review"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-data-state"
      category: "data_or_state_migration"
      policySourcePaths:
        - "docs/public/project-knowledge-plane.md"
        - "schemas/memory-promotion-ledger.schema.json"
        - "missing-policy: candidate persistence rollback policy for eval/failure memory state"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommandsSource: "missing_policy"
  requiresManualEvidence: false
  mergePolicy: "candidate_only_until_promoted"
```

## Scope

Included:

- Define failure-memory candidate shape.
- Add eval fixtures that detect worsened stale/candidate/provenance behavior.
- Require changed approach evidence when the same failure class repeats.
- Map procedural memory candidates to promotion gates and possible final forms: guideline, hook, rule, skill, regression fixture, or backlog item.

Excluded:

- Auto-editing `rules/`, `skills/`, hooks, or installed profiles from a candidate.
- Promoting a single-project symptom into harness-wide memory without recurrence or contract evidence.
- Treating eval trace existence as promotion approval.

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P05-1 | Failure candidate schema | Add fields for failure class, source command, evidence, attempted fix, replan delta, applies-to, does-not-apply-to. | Schema rejects evidence-free procedural candidates. |
| P05-2 | Eval fixture set | Add memory-control-plane regression fixtures and thresholds. | Worsened memory behavior blocks eval gate. |
| P05-3 | Replan guard | Add repeated-failure fixture requiring changed approach. | Same failure class cannot repeat silently. |
| P05-4 | Promotion handoff | Route candidates through Phase 09 promotion ledger. | Candidate remains candidate until gates pass. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P05-1 | `schemas/failure-memory-candidate.schema.json` | none | `tests/failure-memory-candidate-contract.test.mjs` | `node --test tests/failure-memory-candidate-contract.test.mjs` | Evidence-free procedural candidate is rejected. |
| P05-2 | `tools/evals/fixtures/harness-control-plane/memory-control-plane-*.json` | `tools/evals/harness-control-plane.mjs` if fixture discovery changes | `tests/eval-regression-contract.test.mjs` | `npm run test:eval` | Memory regressions are scored. |
| P05-3 | `tests/fixtures/harness-control-plane/failure-memory/repeated-failure.json` | replan helper path identified during Phase 01 | `tests/failure-memory-replan-contract.test.mjs` | `node --test tests/failure-memory-replan-contract.test.mjs` | Same failure class without changed approach blocks closeout. |
| P05-4 | none | `scripts/awtl-memory-promotion.mjs` only if handoff lacks fields | `tests/memory-promotion-contract.test.mjs` | `node --test tests/memory-promotion-contract.test.mjs` | Promotion gates still require evidence/review/replay/rollback/scope owner. |

## Verification Plan

- [ ] `npm run test:eval`
- [ ] `node --test tests/memory-promotion-contract.test.mjs`
- [ ] `npm test`
- [ ] Independent review that no procedural memory is auto-promoted.

## Completion Evidence

- Failure-memory candidate schema.
- Eval fixture output.
- Repeated-failure replan fixture.
- Promotion handoff evidence or explicit gap.

## Handoff Notes

Phase 06 can score and observe memory quality using these fixtures, but rollout remains blocked until source tests and package/account-root evidence are complete.
