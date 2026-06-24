# Phase 01 - Quantitative Lab Result Schema v1

## Status

Status: foundation-batch-ready

## Objective

Extend `harness-lab` so it extracts metrics from suite JSON output, applies thresholds, records stable/candidate deltas, and blocks promotion on quantitative regression.

This phase defines the shared result contract used by Phases 02-05. It does not by itself complete the user's same-document comparison or account-root isolation goals; those close only when Phases 02 and 03 pass in the foundation batch.

## Owned Paths

- `tools/harness-lab/harness-lab.mjs`
- `tests/harness-lab-contract.test.mjs`
- `docs/public/guidelines/harness-bootstrap-lab.md`

## Read-Only Paths

- `tools/evals/harness-control-plane.mjs`
- `tools/evals/fixtures/harness-control-plane/golden-regression.json`
- `package/package-contract.yaml`
- `schemas/verification.contract.yaml`

## Surface Classification

| Path | Classification | Mutation Policy |
|---|---|---|
| `tools/harness-lab/harness-lab.mjs` | `source_only` | allowed |
| `tests/harness-lab-contract.test.mjs` | `source_only` | allowed |
| `docs/public/guidelines/harness-bootstrap-lab.md` | `source_only` | allowed |
| installed account-root profiles | `installed_profile_or_account_root` | forbidden in this phase |

## Required Behavior

- Add suite-level `durationMs`.
- Add optional suite `metrics` definitions with `id`, `path`, `direction`, `min`, `max`, `maxRegression`, and `required`.
- Parse suite stdout JSON for configured metrics.
- Add `candidate.results[].metrics`.
- Add `candidate.results[].metricFailures`.
- Mark a suite failed with `failureClass: metric_threshold` when command exit is acceptable but metric thresholds fail.
- Add `quantitative` summary to `lab-result.json`.
- Compare stable/candidate numeric metrics when both sides exist.
- Mark metric comparison failed when regression exceeds `maxRegression`.
- Keep existing exit-code drift comparison behavior.
- Reserve account-root guard result fields so Phase 03 can fail promotion through the same shared contract.

## Shared Lab Result Contract

Minimum shape:

```json
{
  "schemaVersion": "moonshot-harness-lab-result.v1",
  "authority": "external-bootstrap-lab",
  "run": {
    "runId": "string",
    "runRoot": "string",
    "baselineRunId": "string|null",
    "candidateRunId": "string|null",
    "fixtureSetId": "string|null",
    "scorerVersion": "string|null"
  },
  "stable": {
    "results": []
  },
  "candidate": {
    "results": [
      {
        "id": "suite-id",
        "status": "passed|failed",
        "failureClass": "none|command_exit|timeout|stdout_json_parse|metric_missing|metric_threshold",
        "durationMs": 0,
        "metrics": [],
        "metricFailures": []
      }
    ]
  },
  "quantitative": {
    "candidate": {
      "suiteCount": 0,
      "passedSuiteCount": 0,
      "suitePassRate": 0,
      "metricCount": 0,
      "failedMetricCount": 0
    },
    "comparisons": [
      {
        "kind": "metric",
        "suiteId": "harness-control-plane-eval",
        "fixtureId": "string|null",
        "inputHash": "sha256:<hex>|null",
        "metricId": "score",
        "baselineValue": 1,
        "candidateValue": 1,
        "delta": 0,
        "direction": "higher",
        "maxRegression": { "absolute": 0, "percent": null },
        "status": "passed|failed|skipped",
        "failureClass": "none|metric_regression|fixture_identity_mismatch"
      }
    ]
  },
  "accountRootGuard": {
    "status": "not_applicable|passed|failed",
    "failureClass": "none|account_root_contamination|account_root_guard_unavailable",
    "protectedRoots": []
  },
  "promotion": {
    "status": "eligible|blocked|smoke_only",
    "blockers": []
  }
}
```

Candidate-generated `verify.json`, scorer output, adapter output, or chat output can populate fields in this structure, but none of them replaces `authority: "external-bootstrap-lab"`.

## Failure Class Enum

Canonical values:

- `none`
- `command_exit`
- `timeout`
- `stdout_json_parse`
- `metric_missing`
- `metric_threshold`
- `metric_regression`
- `fixture_identity_mismatch`
- `artifact_missing`
- `artifact_schema_invalid`
- `scorer_parse_failure`
- `account_root_contamination`
- `account_root_guard_unavailable`
- `swe_bench_dependency_missing`
- `swe_bench_verifier_failure`
- `external_dependency_skipped`
- `promotion_state_invalid`

## Metric Definition Contract

```yaml
metricDefinition:
  id: "score"
  path: "score"
  source: "stdout_json"
  required: true
  direction: "higher" # higher | lower
  min: 1
  max: null
  maxRegression:
    absolute: 0
    percent: null
```

Rules:

- `required: true` means missing, unparsable, or non-numeric values fail with `metric_missing`.
- `min` and `max` apply to the candidate value in candidate-only runs.
- `maxRegression` applies only when stable/baseline and candidate numeric values both exist.
- Metrics without `maxRegression` may be reported but do not block regression by themselves.

## Stdout Parsing Rules

```yaml
metricExtraction:
  stdoutMode: final_json_object
  pathSyntax: dot_path_v1
  parseFailureClass: stdout_json_parse
  nonNumericRequiredMetricFailureClass: metric_missing
```

Rules:

- `final_json_object` first attempts to parse the entire stdout as JSON.
- If stdout contains surrounding text, the extractor may parse the final complete JSON object in stdout.
- JSONL and multiple JSON objects are not part of v1 unless a later phase extends the parser.
- `dot_path_v1` reads object keys separated by `.`, for example `score` or `summary.failedCount`.
- Array indexes are unsupported in v1.
- A required metric path that resolves to `undefined`, `null`, `NaN`, a non-numeric string, an object, or an array fails with `metric_missing`.

## maxRegression Calculation

For numeric comparisons:

```text
direction=higher: regression = baselineValue - candidateValue
direction=lower:  regression = candidateValue - baselineValue
fail when regression > maxRegression.absolute
fail when maxRegression.percent is set and regression / abs(baselineValue) > maxRegression.percent
```

If `baselineValue` is 0 and `maxRegression.percent` is set, percent comparison is skipped and absolute comparison remains authoritative.

## Default Metrics

The built-in `harness-control-plane-eval` suite should define at least:

```js
[
  { id: 'score', path: 'score', direction: 'higher', min: 1, maxRegression: 0, required: true },
  { id: 'passedCount', path: 'passedCount', direction: 'higher', maxRegression: 0, required: true },
  { id: 'failedCount', path: 'failedCount', direction: 'lower', max: 0, maxRegression: 0, required: true },
  { id: 'totalCount', path: 'totalCount', direction: 'higher', maxRegression: 0, required: true }
]
```

Implementation may accept the shorthand `maxRegression: 0` and normalize it to `{ "absolute": 0, "percent": null }`.

## Acceptance Criteria

- Candidate-only lab result records `quantitative.candidate.metricCount`.
- Candidate-only lab fails when a required metric is missing or below threshold.
- Stable/candidate lab records metric delta entries.
- Stable/candidate lab fails when a configured metric regresses beyond budget.
- Required metric parse failure is classified as `stdout_json_parse` when stdout is not parseable and `metric_missing` when the required path/value is absent or non-numeric.
- Existing command-exit failure behavior remains intact.
- Result file remains external to candidate authority and keeps `authority: "external-bootstrap-lab"`.
- Candidate-only runs are `smoke_only` unless a baseline/stable comparison is present.

## Required Evidence

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:eval`
- `npm run test:lab`
- Result path for the passing `npm run test:lab` run.

## Out of Scope

- New fixture corpus.
- SWE-bench integration.
- Package/runtime payload adoption.
- Live `.moonshot-relay`, `.codex`, or `.claude` mutation.

## Phase 01 Closeout

Status: complete

Implemented by `tools/harness-lab/harness-lab.mjs` and covered by `tests/harness-lab-contract.test.mjs`.
