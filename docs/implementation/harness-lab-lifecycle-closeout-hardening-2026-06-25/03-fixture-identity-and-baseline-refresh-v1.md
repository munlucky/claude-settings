# Phase 03 - Fixture Identity and Baseline Refresh v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "03"
  title: "Fixture Identity and Baseline Refresh"
  status: planned
  dependsOn:
    - "01"
    - "02"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-lab.mjs
    - tools/harness-lab/harness-loop.mjs
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - .moonshot-relay/harness-lab/baselines/current.json
    - .moonshot-relay/harness-lab/baselines/**
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - live account-root profiles
      - Docker registry publish
      - automatic git commit or push
  requiredEvidenceSlots:
    - fixture_identity_completeness_negative_tests
    - refreshed_baseline_manifest
    - refreshed_current_pointer
    - post_refresh_closeout_receipt
```

## Objective

Prevent promotion-grade comparison from passing with incomplete fixture identity, then refresh the active legacy baseline into strengthened evidence.

## Required Behavior

- Compare reports must include `fixtureIdentity.completeness`.
- If either side provides any identity field, promotion-grade compare requires complete required fields:
  - `fixtureSetId`
  - `scorerVersion`
  - metric-level `fixtureId` or a documented suite-level equivalent
- Missing required identity must add a blocking regression with `failureClass: fixture_identity_incomplete`.
- Fixture identity mismatch remains `fixture_identity_mismatch`.
- A legacy baseline manifest without strengthened policy/runtime evidence must be detectable.
- Add or document a refresh operation using existing commands, preferably `lab:calibrate --promote` or a small wrapper, that creates a new baseline manifest containing:
  - promotion policy;
  - runtime gate evidence;
  - compare hash;
  - candidate hash;
  - pointer evidence.

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P03-AC1 | Baseline identity null with candidate identity present fails promotion-grade compare. | `execution/phase-03/baseline-identity-null-negative-test.log` |
| P03-AC2 | Candidate identity null with baseline identity present fails promotion-grade compare. | `execution/phase-03/candidate-identity-null-negative-test.log` |
| P03-AC3 | Matching complete identity passes. | `execution/phase-03/complete-identity-pass.json` |
| P03-AC4 | Legacy current baseline is detected before refresh. | `execution/phase-03/legacy-baseline-detected.json` |
| P03-AC5 | Refreshed baseline becomes current and has strengthened manifest evidence. | `execution/phase-03/refreshed-current-baseline.json` |
| P03-AC6 | `lab:closeout` on refreshed promoted receipt is commit-consumable. | `execution/phase-03/refreshed-closeout-consumable.json` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run lab:calibrate -- --promote` or selected refresh command
- `npm run lab:closeout`
- `npm test`
- `git diff --check`

