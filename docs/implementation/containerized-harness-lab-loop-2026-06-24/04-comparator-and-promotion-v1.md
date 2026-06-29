# Phase 04 - Comparator and Promotion v1

Status: complete

## Phase Metadata

```yaml
phaseMetadata:
  phaseId: "04"
  title: "Comparator and Promotion"
  status: complete
  dependsOn:
    - "01"
    - "02"
    - "03"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/**
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/**
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/**
      - .moonshot-relay/harness-lab-runs/** as generated evidence only
    forbidden:
      - live account-root profiles
      - Docker registry publish
      - package runtime payload adoption
  requiredEvidenceSlots:
    - compare_report_pass
    - compare_report_regression
    - promotion_atomicity_test
    - current_pointer_manifest
```

## Objective

Implement the compare and promote rules that let a passing candidate become the next baseline.

## Required Behavior

- Comparator consumes only H0 baseline/candidate result artifacts.
- Candidate-generated scorecards do not decide promotion.
- Regression classes are explicit:
  - `new_failed_task`
  - `score_drop`
  - `artifact_contract_break`
  - `mutation_safety_break`
  - `stale_evidence_break`
  - `runtime_regression`
  - `fixture_identity_mismatch`
- Promotion requires immutable artifact hash, compare report hash, and atomic pointer update.
- Partial promotion copy failure must leave the prior baseline pointer intact.

## Comparator Mandatory Rules

```txt
critical_task_failures == 0
regression_count == 0
candidate.pass_rate >= baseline.pass_rate
candidate.normalized_score >= baseline.normalized_score
candidate.forbidden_mutation_count == 0
candidate.schema_error_count == 0
candidate.stale_source_count == 0
fixture identity matches
accountRootGuard.status == passed
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P04-AC1 | Baseline pass/candidate fail becomes `new_failed_task`. | `execution/phase-04/new-failed-task-report.json` |
| P04-AC2 | Candidate score drop beyond budget becomes `score_drop`. | `execution/phase-04/score-drop-report.json` |
| P04-AC3 | Fixture mismatch blocks promotion. | `execution/phase-04/fixture-mismatch-report.json` |
| P04-AC4 | Promotion writes `baselines/current.json` only after comparator pass. | `execution/phase-04/promotion-pass-test.log` |
| P04-AC5 | Simulated partial copy failure leaves prior pointer intact. | `execution/phase-04/promotion-atomicity-test.log` |

## Required Evidence Commands

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:lab`

## Out of Scope

- Automatic live install after promotion.
- Publishing promoted images.
