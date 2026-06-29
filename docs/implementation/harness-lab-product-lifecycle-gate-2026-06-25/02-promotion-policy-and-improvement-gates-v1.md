# Phase 02 - Promotion Policy and Improvement Gates v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "02"
  title: "Promotion Policy and Improvement Gates"
  status: planned
  dependsOn:
    - "01"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-lab.mjs
    - tools/harness-lab/harness-loop.mjs
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/**
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - live account-root profiles
      - package runtime payload adoption
      - Docker registry publish
      - git commit or push
  requiredEvidenceSlots:
    - no_regression_policy_pass
    - strict_improvement_equal_score_block
    - strict_improvement_positive_delta_pass
    - policy_mode_in_compare_report
    - policy_config_source
```

## Objective

Separate two different promotion meanings:

```text
no_regression:
  candidate may match baseline as long as regressions are zero

strict_improvement:
  candidate must exceed baseline by a configured threshold while preserving all no-regression critical gates
```

## Required Behavior

- Add explicit promotion policy metadata to compare reports and candidate summaries.
- Default policy remains `no_regression` unless the operator selects strict mode.
- `strict_improvement` must define which aggregate metric is authoritative, such as `normalizedScore`, and the minimum delta.
- Equal score must fail strict mode with a clear failure class such as `insufficient_improvement`.
- Existing regression classes remain blocking in both modes.
- Policy mode and threshold must be copied into promotion manifest evidence.

## Policy Contract

```yaml
promotionPolicy:
  mode: no_regression | strict_improvement
  aggregateMetric: normalizedScore
  minDelta: 0.0 # no_regression
  minDeltaStrict: 0.01
  configSource: "CLI flag or checked-in default policy block"
  required:
    - regressionCount == 0
    - fixtureIdentity.matches == true
    - runtimeGates.allPassed == true
    - candidate.normalizedScore >= baseline.normalizedScore
  modeSpecificRequired:
    no_regression:
      - candidate.normalizedScore - baseline.normalizedScore >= 0
    strict_improvement:
      - candidate.normalizedScore - baseline.normalizedScore >= minDeltaStrict
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P02-AC1 | Compare report records policy mode, metric, threshold, and decision reason. | `execution/phase-02/policy-mode-report.json` |
| P02-AC2 | Equal baseline/candidate score passes `no_regression`. | `execution/phase-02/no-regression-equal-score.json` |
| P02-AC3 | Equal baseline/candidate score fails `strict_improvement`. | `execution/phase-02/strict-improvement-equal-score.json` |
| P02-AC4 | Positive delta passes `strict_improvement` only when all critical gates pass. | `execution/phase-02/strict-improvement-positive-delta.json` |
| P02-AC5 | Policy default and CLI/config override source are recorded in compare and promotion artifacts. | `execution/phase-02/policy-config-source.json` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- targeted comparator negative fixtures for equal score and insufficient delta
- Docker candidate compare run showing policy metadata in the compare artifact

## Out of Scope

- Choosing permanent production thresholds beyond the phase-local default.
- LLM judge calibration.
