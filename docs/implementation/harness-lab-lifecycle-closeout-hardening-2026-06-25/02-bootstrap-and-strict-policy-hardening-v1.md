# Phase 02 - Bootstrap and Strict Policy Hardening v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "02"
  title: "Bootstrap and Strict Policy Hardening"
  status: planned
  dependsOn:
    - "01"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tools/harness-lab/harness-lab.mjs
    - tests/harness-lab-contract.test.mjs
    - package.json
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - .moonshot-relay/harness-lab/baselines/current.json
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - package.json
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - live account-root profiles
      - Docker registry publish
      - automatic git commit or push
  requiredEvidenceSlots:
    - no_baseline_auto_promotes
    - existing_baseline_auto_candidate_only
    - strict_min_delta_floor
    - equal_score_strict_block
```

## Objective

Make the lifecycle command match operator expectation:

```text
first run:
  lab:auto creates the first current baseline after passing bootstrap

normal run:
  lab:auto remains candidate-only and does not promote by default
```

## Required Behavior

- If no baseline pointer exists, plain `lab:auto` must run baseline Docker benchmark, candidate Docker benchmark, compare, and promote the passing candidate as the first current baseline.
- If no baseline pointer exists and compare fails, `lab:auto` must exit non-zero and leave no current pointer.
- If a baseline pointer exists, plain `lab:auto` must still run candidate-only and must not promote.
- `lab:auto:promote` remains the explicit promotion path for existing-baseline candidate runs.
- `strict_improvement` must reject `minDelta <= 0`.
- Strict mode must fail equal score even if an operator passes `--min-delta 0`.
- `no_regression` remains allowed to pass equal score when regression count is zero.

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P02-AC1 | Temporary empty lab state plus `lab:auto` creates `baselines/current.json`. | `execution/phase-02/no-baseline-auto-bootstrap-promotes.json` |
| P02-AC2 | Existing baseline path does not call baseline Docker role. | `execution/phase-02/existing-baseline-candidate-only-audit.json` |
| P02-AC3 | Failed initial bootstrap leaves no current pointer. | `execution/phase-02/no-baseline-failure-no-pointer.log` |
| P02-AC4 | Strict policy rejects zero or negative min delta. | `execution/phase-02/strict-min-delta-floor.log` |
| P02-AC5 | Equal score passes only in `no_regression`, not strict mode. | `execution/phase-02/equal-score-policy-tests.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- Docker lifecycle smoke against temporary lab state root

