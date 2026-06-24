# Phase 02 - Fixed Fixture Corpus and Artifact Scorer v1

## Status

Status: foundation-batch-ready-after-phase-01-schema

## Objective

Create a deterministic local fixture corpus so the same document, plan, or evidence input can be executed by stable and candidate harnesses and scored quantitatively by artifact quality, not just command status.

This phase is part of the Phases 01-03 foundation batch. It is the phase that makes "same document based quantitative comparison" concrete by binding every comparison to `fixtureId` and `inputHash`.

## Owned Paths

- `tools/evals/**`
- `tests/fixtures/**`
- `schemas/**` for scorer result contracts if needed
- `docs/public/guidelines/harness-bootstrap-lab.md`
- `tests/**` for scorer contract tests

## Read-Only Paths

- `tools/harness-lab/harness-lab.mjs`
- `package/package-contract.yaml`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/**`

## Surface Classification

| Path | Classification | Mutation Policy |
|---|---|---|
| fixture corpus and scorer source | `source_only` | allowed |
| generated scorer outputs | `data_or_state_migration` | run-local only, not committed |
| real user documents outside fixture paths | `data_or_state_migration` | forbidden |

## Required Behavior

- Define a small fixed corpus of harness tasks with pinned inputs.
- Each fixture must declare expected artifacts, required files, schema checks, and scoring rules.
- Scorer output must be JSON and importable by `harness-lab` metrics.
- Scorer should capture:
  - artifact presence
  - artifact hash
  - schema validity
  - required section coverage
  - claim/evidence coverage when evidence packs are present
  - diff summary against expected output where applicable
- Scorer version must be recorded so historical scores are comparable.

## Fixture Manifest Contract

The first fixture manifest should live under a source-controlled fixture path such as `tests/fixtures/harness-improvement-loop/fixture-manifest.json`.

Minimum shape:

```json
{
  "schemaVersion": "moonshot-harness-fixture-manifest.v1",
  "fixtureSetId": "harness-improvement-loop-foundation-v1",
  "fixtures": [
    {
      "fixtureId": "plan-package-minimal-valid",
      "title": "Minimal valid plan package",
      "fixtureType": "plan_package",
      "inputPath": "tests/fixtures/harness-improvement-loop/plan-package-minimal-valid/input.md",
      "inputHash": "sha256:<hex>",
      "allowedOutputRoot": "<runRoot>/artifacts/plan-package-minimal-valid",
      "expectedArtifacts": [
        { "path": "00-master-plan-v1.md", "required": true, "schema": null },
        { "path": "01-phase-v1.md", "required": true, "schema": null },
        { "path": "planning-loop/plan-quality-review-iter-01.yaml", "required": true, "schema": null }
      ],
      "scorer": { "id": "artifact-scorer", "version": "1" }
    },
    {
      "fixtureId": "plan-package-missing-scorecard",
      "title": "Plan package with intentionally missing closeout evidence",
      "fixtureType": "plan_package",
      "inputPath": "tests/fixtures/harness-improvement-loop/plan-package-missing-scorecard/input.md",
      "inputHash": "sha256:<hex>",
      "allowedOutputRoot": "<runRoot>/artifacts/plan-package-missing-scorecard",
      "expectedArtifacts": [
        { "path": "execution/phase-01/SCORECARD.md", "required": true, "schema": null }
      ],
      "scorer": { "id": "artifact-scorer", "version": "1" }
    }
  ]
}
```

The second fixture is intentionally failure-oriented. It must prove that the scorer can report `artifact_missing` and that `harness-lab` can turn that scorer result into a promotion blocker.

## Same Document Identity Rule

- Stable and candidate output can be compared only when `fixtureSetId`, `fixtureId`, and `inputHash` match.
- `inputHash` is the SHA-256 of the fixture input bytes as checked into the repository.
- If identity differs, comparison fails with `failureClass: fixture_identity_mismatch`.
- A candidate-only run may produce scorer metrics, but it cannot claim improvement without a baseline/stable result for the same fixture identity.

## Scorer Execution Boundary

The artifact scorer scores an already produced artifact tree under `allowedOutputRoot`. It does not run an agent, mutate source, fetch network data, or read live user documents.

Harness or agent execution that produces the artifact tree is a separate suite command. The scorer consumes only:

- fixture manifest entry
- allowed output root
- produced artifact files
- optional schemas named by the fixture entry

## Scorer Result JSON Contract

Minimum shape:

```json
{
  "schemaVersion": "moonshot-artifact-scorer-result.v1",
  "fixtureSetId": "harness-improvement-loop-foundation-v1",
  "fixtureId": "plan-package-minimal-valid",
  "inputHash": "sha256:<hex>",
  "scorerVersion": "1",
  "status": "passed",
  "passed": true,
  "metrics": {
    "artifactPresenceRate": 1,
    "schemaValidityRate": 1,
    "requiredSectionCoverage": 1,
    "missingRequiredCount": 0
  },
  "artifacts": [
    {
      "path": "00-master-plan-v1.md",
      "required": true,
      "exists": true,
      "sha256": "sha256:<hex>",
      "schemaValid": true
    }
  ],
  "failures": []
}
```

Failure shape:

```json
{
  "failureClass": "artifact_missing|artifact_schema_invalid|scorer_parse_failure",
  "artifactPath": "execution/phase-01/SCORECARD.md",
  "message": "required artifact missing"
}
```

## Artifact Canonicalization

- Artifact paths are repository-style forward-slash relative paths.
- File hashes use exact file bytes; newline normalization is not applied.
- Directory traversal order is lexicographic by normalized relative path.
- File modification time, creation time, absolute paths, and run-root paths are not part of artifact hashes.
- Generated timestamps inside artifacts should be either forbidden by fixture rules or validated through schema fields that permit deterministic comparison.
- Symlink artifacts are scored as metadata entries unless a fixture explicitly allows following links inside `allowedOutputRoot`.

## Acceptance Criteria

- Stable and candidate runs against the same fixture produce comparable scorer JSON.
- Stable and candidate comparison is blocked when `fixtureId` or `inputHash` differs.
- A missing required artifact causes a metric failure.
- A schema-invalid artifact causes a metric failure.
- Scorer output is deterministic for unchanged inputs.
- Fixture corpus does not depend on live account-root state or unpinned external web data.

## Required Evidence

- Targeted scorer tests introduced by this phase.
- One passing candidate-only fixture scorer run.
- One intentionally failing fixture scorer test showing artifact failure classification.
- `npm run test:lab` after integration with Phase 01 metric extraction.

## Out of Scope

- SWE-bench task execution.
- Live user workspace tasks.
- LLM quality judging as promotion authority.

## Phase 02 Closeout

Status: complete

Implemented by `tools/evals/artifact-scorer.mjs`, `tests/fixtures/harness-improvement-loop/fixture-manifest.json`, and the related harness lab contract tests.
