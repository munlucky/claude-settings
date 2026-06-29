# Phase 04 - Promotion and Rollback Integrity v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "04"
  title: "Promotion and Rollback Integrity"
  status: planned
  dependsOn:
    - "01"
    - "02"
    - "03"
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
      - live account-root profile mutation
      - Docker registry publish
      - package runtime payload adoption
      - git commit or push
  requiredEvidenceSlots:
    - promotion_identity_binding_pass
    - promotion_identity_binding_negative_tests
    - rollback_manifest_validation
    - pointer_atomicity_evidence
    - compare_and_pointer_cas_contract
```

## Objective

Ensure promotion and rollback cannot mix unrelated candidate, compare, baseline, or pointer artifacts.

## Required Behavior

- Promotion must verify:
  - candidate artifact exists and hash matches manifest input
  - compare report exists and hash is recorded
  - `compareReport.candidateRunId` matches candidate run identity
  - `compareReport.baselineRunId` matches current baseline artifact identity
  - compare report was created against the current baseline pointer unless an explicit override is recorded
  - fixture identity matches
  - promotion policy passed
  - runtime/auth hard gates passed
- Promotion must use a compare-and-swap style pointer update:
  - read current pointer id and SHA-256 before promotion
  - require expected previous pointer id and hash to match at write time
  - write next pointer to a temp file
  - fsync or equivalent best-effort flush when available
  - atomically replace `current.json`
- Promotion must atomically update `baselines/current.json`.
- Promotion manifest must include previous baseline id, new baseline id, candidate run id, compare report hash, policy mode, and source fingerprint.
- Rollback must validate target baseline manifest, lab artifact, compare artifact if present, and artifact hashes before pointer replacement.
- Rollback must write a rollback audit artifact under generated lab state.
- Rollback must use the same pointer CAS contract. Invalid target, missing artifact, hash mismatch, or simulated partial pointer write must preserve the old pointer.

## Required Pointer Evidence

Promotion and rollback audits must record:

```yaml
pointerEvidence:
  previousBaselineId: string
  previousPointerSha256: string
  expectedPreviousPointerSha256: string
  newBaselineId: string
  newPointerSha256: string
  manifestSha256: string
  labResultSha256: string
  compareReportSha256: string|null
  override:
    used: boolean
    reason: string|null
    operatorProofPath: string|null
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P04-AC1 | Valid candidate/compare/current baseline identity promotes successfully. | `execution/phase-04/promotion-binding-pass.json` |
| P04-AC2 | Mismatched candidate id blocks promotion. | `execution/phase-04/promotion-mismatched-candidate-test.log` |
| P04-AC3 | Stale baseline pointer blocks promotion unless explicit override exists. | `execution/phase-04/promotion-stale-baseline-test.log` |
| P04-AC4 | Partial promotion copy failure preserves old pointer. | `execution/phase-04/promotion-atomicity-test.log` |
| P04-AC5 | Rollback validates target manifest and writes rollback audit. | `execution/phase-04/rollback-integrity-test.json` |
| P04-AC6 | Invalid rollback target, missing artifact, hash mismatch, and partial pointer write preserve old pointer. | `execution/phase-04/rollback-atomicity-negative-tests.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- targeted promote/rollback negative tests
- Docker candidate promote dry run or generated-state fixture run

## Out of Scope

- Deleting old baselines.
- Source branch rollback.
- Git commit or push.
