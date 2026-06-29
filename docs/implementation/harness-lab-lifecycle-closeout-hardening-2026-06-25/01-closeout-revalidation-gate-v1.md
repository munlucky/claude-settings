# Phase 01 - Closeout Revalidation Gate v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "01"
  title: "Closeout Revalidation Gate"
  status: planned
  dependsOn: []
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - tools/harness-lab/harness-lab.mjs
    - .moonshot-relay/harness-lab/baselines/current.json
    - .moonshot-relay/harness-lab/runs/**
    - .moonshot-relay/harness-lab/compare/**
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
    - closeout_revalidation_pass
    - stale_pointer_negative_test
    - stale_compare_hash_negative_test
    - stale_source_fingerprint_negative_test
    - runtime_gate_negative_test
```

## Objective

Turn `lab:closeout` from a receipt reader into a commit-consumption validator.

## Required Behavior

- `lab:closeout` must read the selected receipt and revalidate:
  - receipt status is `promoted_ready_for_commit_workflow`;
  - current pointer baseline id equals receipt baseline id;
  - current pointer SHA-256 equals receipt `baselinePointerAfter.sha256`;
  - promoted baseline manifest exists;
  - manifest candidate id and compare hash match receipt;
  - candidate run artifact exists and SHA-256 matches receipt;
  - compare report exists and SHA-256 matches receipt;
  - runtime gate status is `healthy`;
  - source fingerprint digest matches current checkout unless an explicit documented override is provided.
- Any failed revalidation sets `consumableByCommitWorkflow=false`.
- Revalidation result must list failed checks in `blockingGates`.
- `lab:closeout` remains read-only except for optional generated audit output.

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P01-AC1 | Promoted receipt with current pointer and matching hashes is consumable. | `execution/phase-01/closeout-revalidation-pass.json` |
| P01-AC2 | Stale current pointer blocks commit consumption. | `execution/phase-01/stale-pointer-negative-test.log` |
| P01-AC3 | Compare or candidate hash mismatch blocks commit consumption. | `execution/phase-01/hash-mismatch-negative-test.log` |
| P01-AC4 | Runtime gate not healthy blocks commit consumption. | `execution/phase-01/runtime-gate-negative-test.log` |
| P01-AC5 | Source fingerprint drift blocks commit consumption. | `execution/phase-01/source-fingerprint-negative-test.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run lab:closeout`

