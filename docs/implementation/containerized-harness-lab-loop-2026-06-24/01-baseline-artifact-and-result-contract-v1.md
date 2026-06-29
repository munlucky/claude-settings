# Phase 01 - Baseline Artifact and Result Contract v1

Status: complete

## Phase Metadata

```yaml
phaseMetadata:
  phaseId: "01"
  title: "Baseline Artifact and Result Contract"
  status: complete
  dependsOn: []
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/**
    - tests/harness-lab-contract.test.mjs
    - tests/fixtures/harness-lab/**
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/**
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - AGENTS.md
    - README.md
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/public/guidelines/harness-bootstrap-lab.md
      - docs/implementation/containerized-harness-lab-loop-2026-06-24/**
    forbidden:
      - package/claude/profile/**
      - package/codex/profile/**
      - .claude/**
      - .codex/**
      - live account-root profiles
  requiredEvidenceSlots:
    - baseline_artifact_manifest
    - lab_result_schema_test
    - npm_run_test_lab
```

## Objective

Define the immutable baseline artifact and result contract used by later container runs. This phase extends the existing `freeze` and `lab-result.json` authority model without requiring Docker execution yet.

## Required Behavior

- Baseline artifact manifest records `baselineId`, `sourceFingerprint`, `suiteId`, `fixtureSetId`, `scorerVersion`, `artifactSha256`, `createdAt`, and `authority: external-bootstrap-lab`.
- Dirty candidate reproducibility is represented by source fingerprint plus dirty patch hash or archived context hash.
- Candidate-only runs remain `promotion.status: smoke_only`.
- Improvement claims require baseline and candidate run ids for the same fixture identity.
- Result schema must not trust candidate-owned scorecards as promotion authority.

## Baseline Manifest Shape

```json
{
  "schemaVersion": "moonshot-harness-baseline-artifact.v1",
  "authority": "external-bootstrap-lab",
  "baselineId": "baseline-0001",
  "sourceFingerprint": {},
  "suiteId": "smoke",
  "fixtureSetId": "harness-lab-smoke-v1",
  "scorerVersion": "artifact-scorer-v1",
  "artifact": {
    "kind": "npm_pack|container_image|worktree_archive",
    "path": "",
    "sha256": "",
    "imageDigest": null
  },
  "createdAt": "2026-06-24T00:00:00Z"
}
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P01-AC1 | Baseline manifest schema is documented and covered by a fixture or contract test. | `execution/phase-01/baseline-artifact-manifest.json` |
| P01-AC2 | Candidate-only run cannot claim improvement. | `node --test tests/harness-lab-contract.test.mjs` |
| P01-AC3 | Existing `npm run test:lab` still writes `authority: "external-bootstrap-lab"`. | `execution/phase-01/npm-run-test-lab.log` |
| P01-AC4 | Dirty worktree reproducibility path is explicit. | `execution/phase-01/source-fingerprint-sample.json` |

## Required Evidence Commands

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:lab`

## Out of Scope

- Building Docker images.
- Publishing images.
- Mutating package runtime payloads or installed account roots.
