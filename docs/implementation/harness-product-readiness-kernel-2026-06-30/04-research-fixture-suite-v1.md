# Phase 04 - Research Fixture Suite v1

## Metadata

```yaml
phase:
  id: "04"
  title: Research Fixture Suite
  status: blocked_until_threshold_schema_and_surface_contract
  dependsOn:
    - "02"
    - "03"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/evals/**
    - tests/fixtures/**
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - .moonshot-relay/docs/research/2026-06-24-harness-product-surfaces-doctor-runner-lifecycle/**
  outOfScopePaths:
    - tools/research/**
    - skills/moonshot-research/**
  writeSetBoundary: "Repo-local implementation is limited to tools/evals/**, tests/fixtures/**, harness-lab integration tests, and docs. tools/research/** and skills/moonshot-research/** do not exist in this checkout and must not be assumed."
  liveMutationPolicy: "No live web collection during deterministic fixture scoring unless explicitly marked optional."
  policySources:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/public/repository-layout.md
```

## Goal

Convert `moonshot-research` from an ad hoc evidence pack producer into a fixed regression fixture suite that the H0 lab can score.

This phase does not make live public-web research a deterministic gate. It creates pinned fixtures and thresholded scoring so future live research improvements can be compared safely.

This phase remains blocked until the schema and threshold contract below is accepted. Implementation must not proceed from metric names alone.

## Fixture Contract

Each fixture must declare:

- `fixtureSetId`
- `fixtureId`
- `inputHash`
- `queryVariants`
- `allowedSources`
- `primarySourceRules`
- `boundaryAccessExpectations`
- `claimLedgerRequired`
- `minimumEvidenceCount`
- `minimumPrimarySourceRatio`
- `minimumClaimCoverageRatio`
- `maximumAdjacentRepoContaminationRatio`
- `requiredArtifactPaths`

Initial schema owner:

```text
tests/fixtures/harness-research-fixtures/fixture-manifest.json
tools/evals/research-fixture-scorer.mjs
```

Initial threshold draft for the seed fixture:

```yaml
minimumEvidenceCount: 50
minimumPrimarySourceRatio: 0.70
minimumClaimCoverageRatio: 0.90
maximumAdjacentRepoContaminationRatio: 0.10
maximumLaneFailureCount: 0
requiredBoundaryAccessItemCount: 1
requiredArtifactCompleteness: 1.0
```

These values are calibration defaults, not universal policy. Phase execution must validate them against the pinned 2026-06-24 fixture and adjust only with review evidence.

Initial fixture seed may use the 2026-06-24 research package, but the scorer must treat adjacent GitHub repo contamination as a measurable failure mode.

## Scoring Metrics

| Metric | Direction | Blocking Rule |
| --- | --- | --- |
| `evidenceCount` | higher | must meet fixture minimum |
| `queryVariantCount` | higher | must match fixture expectation |
| `laneFailureCount` | lower | hard fail above fixture maximum |
| `primarySourceRatio` | higher | hard fail below threshold |
| `claimLedgerCoverage` | higher | hard fail below threshold |
| `boundaryAccessItemCount` | higher | hard fail when required boundary items missing |
| `adjacentRepoContaminationRatio` | lower | hard fail above threshold |
| `requiredArtifactCompleteness` | higher | hard fail below 1.0 |

Lab-result mapping:

- each scorer metric must become a harness metric with `fixtureSetId`, `fixtureId`, `inputHash`, `scorerVersion`, `normalizedScore`, `threshold`, and `failureClass`;
- missing `inputHash` or scorer version is `fixture_identity_incomplete`;
- contamination classification must record the matched source URL/repository and the rule that made it adjacent/non-primary.

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| P04-AC1 | Fixed research fixtures can be scored without network access. | scorer test |
| P04-AC2 | Scorer fails a fixture with adjacent-repo contamination above threshold. | negative fixture test |
| P04-AC3 | Scorer fails missing `claim-ledger.json`, `evidence.json`, or boundary/access reporting. | missing artifact test |
| P04-AC4 | Research fixture metrics appear as lab quantitative metrics with complete fixture identity. | lab integration test |
| P04-AC5 | Optional live collectors are reported as unavailable/degraded without passing deterministic fixture claims. | doctor/research readiness test |

## Validation Gates

Supporting check:

```powershell
node --test tests/harness-lab-contract.test.mjs
```

Required gate:

```powershell
npm run test:lab
```

If new eval tooling is added:

```powershell
npm run test:eval
npm test
```

## Open Risks

- Live research can change over time. The deterministic gate must use pinned fixtures; live collection belongs to optional readiness or exploratory evidence.
- Evidence quantity alone can reward noisy broad queries. Primary-source and contamination thresholds are required.
