# Phase 05 - Calibration, Rollback, and Operations v1

Status: complete

## Phase Metadata

```yaml
phaseMetadata:
  phaseId: "05"
  title: "Calibration, Rollback, and Operations"
  status: complete
  dependsOn:
    - "01"
    - "02"
    - "03"
    - "04"
  surfaceClassification:
    - source_only
    - data_or_state_migration
    - installed_profile_or_account_root
  ownedPaths:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - templates/**
    - tests/harness-lab-contract.test.mjs
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/**
  readOnlyPaths:
    - tools/harness-lab/harness-lab.mjs
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - live account-root profiles
  writeSetBoundary:
    allowed:
      - docs/**
      - templates/**
      - tests/**
      - .moonshot-relay/harness-lab-runs/** as generated evidence only
    forbidden:
      - live account-root profile mutation
      - package payload adoption without explicit future approval
      - Docker image publication
  requiredEvidenceSlots:
    - normal_loop_report
    - calibration_trigger_test
    - rollback_pointer_test
    - retention_cleanup_note
```

## Objective

Document and test the operational loop after the first baseline/candidate calibration: candidate-only normal runs, calibration reruns, promotion, rollback, and retention.

## Required Behavior

- Normal loop runs candidate only and compares against stored baseline artifact.
- Calibration loop reruns baseline when policy triggers fire.
- Rollback is pointer-only for source-first baseline promotion.
- Cleanup never targets real account-root profile paths.
- Live adoption remains out of scope until separately approved with package/runtime and installed-profile evidence.

## State Machine

```yaml
states:
  - baseline_frozen
  - candidate_recorded
  - compared
  - promotion_eligible
  - promoted_source_only
  - calibration_required
  - rollback_required
  - rolled_back
  - rejected
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P05-AC1 | Candidate-only normal loop compares against stored baseline artifact. | `execution/phase-05/normal-loop-report.json` |
| P05-AC2 | Calibration trigger fires for scorer version change. | `execution/phase-05/calibration-scorer-version-test.json` |
| P05-AC3 | Calibration trigger fires for near-threshold candidate score. | `execution/phase-05/calibration-margin-test.json` |
| P05-AC4 | Rollback restores previous baseline pointer only. | `execution/phase-05/rollback-pointer-test.log` |
| P05-AC5 | Retention policy preserves promoted baseline artifacts and compare reports. | `execution/phase-05/retention-policy-audit.md` |

## Required Evidence Commands

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:lab`
- `npm test`

## Out of Scope

- Dashboard UI.
- Live account-root install.
- Docker registry publish.
