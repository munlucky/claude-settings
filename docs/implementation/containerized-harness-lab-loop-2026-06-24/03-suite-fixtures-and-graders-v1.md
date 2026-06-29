# Phase 03 - Suite Fixtures and Graders v1

Status: complete

## Phase Metadata

```yaml
phaseMetadata:
  phaseId: "03"
  title: "Suite Fixtures and Graders"
  status: complete
  dependsOn:
    - "01"
    - "02"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/evals/**
    - tools/harness-lab/**
    - tests/fixtures/harness-lab/**
    - tests/fixtures/harness-improvement-loop/**
    - tests/harness-lab-contract.test.mjs
  readOnlyPaths:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - package/package-contract.yaml
  writeSetBoundary:
    allowed:
      - tools/evals/**
      - tools/harness-lab/**
      - tests/**
      - docs/**
    forbidden:
      - live account-root profiles
      - generated package profile payloads
  requiredEvidenceSlots:
    - fixture_manifest
    - fixture_identity_hashes
    - normalized_grader_report
    - artifact_scorer_test
```

## Objective

Make quantitative comparison meaningful by pinning fixture identity and deterministic grader output.

## Required Behavior

- Every suite fixture must declare `fixtureSetId`, `fixtureId`, and `inputHash`.
- Same-input comparison fails with `fixture_identity_mismatch` when fixture identity differs.
- Every blocking grader emits normalized score `0.0-1.0`, threshold, verdict, and evidence path.
- Artifact scoring covers required file presence, schema validity, and source authority fields.
- LLM judge graders are advisory until calibration fixtures and baseline rerun policy are present.

## Grader Result Shape

```json
{
  "grader": "artifact_schema",
  "score": 1.0,
  "threshold": 1.0,
  "status": "pass",
  "failureClass": "none",
  "evidence": "artifacts/SFG-001/schema.json"
}
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P03-AC1 | Fixture identity mismatch blocks improvement claim. | `execution/phase-03/fixture-identity-test.log` |
| P03-AC2 | Missing required artifact fails with `artifact_missing`. | `execution/phase-03/artifact-missing-test.json` |
| P03-AC3 | Invalid artifact schema fails with `artifact_schema_invalid`. | `execution/phase-03/artifact-schema-test.json` |
| P03-AC4 | Blocking grader output uses normalized score and threshold verdict. | `execution/phase-03/grader-schema-test.json` |
| P03-AC5 | Existing artifact scorer contract remains green. | `node --test tests/harness-lab-contract.test.mjs` |

## Required Evidence Commands

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:eval`
- `npm run test:lab`

## Out of Scope

- Making LLM judge output blocking.
- Using live user documents as fixtures.
