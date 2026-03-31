# Harness Quality Normalization

> Use this guide after real harness usage tests so quality scoring reflects repeated evidence instead of a single successful demo.

Last-Reviewed: 2026-03-30

## Goal

Measure harness quality from repeated real runs, not from one passing experiment.

The normalization layer should answer:

- how well the harness performs on average
- how much evidence exists across distinct runs
- whether the current score is still provisional

Before a run can count, define the document pack in `.claude/docs/guidelines/implementation-test-document-pack.md`.
For large web release evidence, use `.claude/docs/guidelines/one-prompt-recursive-benchmark.md`.

## Storage Model

Keep generated quality evidence outside the tracked repository:

- per-run summary: `.tmp/harness-runs/<run-id>/harness-quality-run.json`
- aggregate report: `.tmp/harness-runs/harness-quality/latest.json`

These files are ignored and must not be promoted into `main`.

## Required Run Summary Fields

Each real usage test should record:

- `runId`
- `executedAt`
- `source`
- `plane`
- `projectType`
- `complexity`
- `taskId`
- `taskOutcomePassed`
- `checks`
- `counters`

For `one_prompt_recursive` runs, also record:

- `benchmarkMode`
- `benchmark`

For `phase_runner_execution` runs, also record:

- `benchmarkMode`
- `engine`

Suggested shape:

```json
{
  "schemaVersion": "1.0",
  "runId": "usage-e2e-slug-cli",
  "executedAt": "2026-03-30T08:23:00Z",
  "source": "real_usage_test",
  "plane": "product_project",
  "projectType": "python-cli",
  "complexity": "small",
  "taskId": "slug-mode-cli",
  "taskOutcomePassed": true,
  "benchmarkMode": "standard",
  "checks": {
    "requiredChecksPassed": true,
    "knowledgeAuditPassed": true,
    "codePolicyPassed": true,
    "workflowChecksPassed": true,
    "artifactsComplete": true,
    "scorecardDone": true,
    "mainStayedClean": true,
    "candidateFlowWorked": true,
    "tddFailureObserved": true
  },
  "counters": {
    "retryCount": 1,
    "handoffCount": 0
  }
}
```

Suggested `one_prompt_recursive` extension:

```json
{
  "benchmarkMode": "one_prompt_recursive",
  "benchmark": {
    "baselineScore": 48,
    "finalScore": 83,
    "deltaScore": 35,
    "hardFailRecovered": true,
    "recursiveRoundsUsed": 3
  }
}
```

Suggested `phase_runner_execution` extension:

```json
{
  "benchmarkMode": "phase_runner_execution",
  "engine": {
    "evidenceLevel": "L3",
    "dispatchValid": true,
    "artifactDriven": true,
    "phaseCompletionFidelity": true,
    "manualRescueRequired": true
  }
}
```

## Scoring Model

The normalizer computes:

### 1. Per-run quality score

Weighted dimensions:

- execution reliability
- verification reliability
- artifact discipline
- isolation discipline
- retry efficiency

Per-run scores remain useful for local diagnosis but are not enough to claim harness quality on their own.

### 2. Aggregate normalized score

The aggregate report should combine:

- average per-run quality
- sample sufficiency
- diversity across execution planes, project types, and complexity levels

This prevents one excellent run from masquerading as a mature harness.

For large web release review, inspect these separate aggregates before trusting a single combined score:

- baseline average
- final average
- delta average
- hard-fail recovery rate
- execution-engine evidence level and fidelity for `phase_runner_execution` runs

## Status Levels

- `provisional`: fewer than 3 real runs
- `emerging`: at least 3 real runs but weak diversity or low score
- `stable`: minimum sample count met and normalized score is healthy

Do not use `stable` while sample count is below 3.

## Command

```bash
python3 .claude/scripts/normalize-harness-quality.py \
  --input-glob ".tmp/harness-runs/**/harness-quality-run.json" \
  --output ".tmp/harness-runs/harness-quality/latest.json"
```

Optional environment override:

```bash
HARNESS_QUALITY_MIN_SAMPLES=5 python3 .claude/scripts/normalize-harness-quality.py \
  --input-glob ".tmp/harness-runs/**/harness-quality-run.json" \
  --output ".tmp/harness-runs/harness-quality/latest.json"
```

Use a higher sample threshold for release-readiness claims when you want stronger evidence than the default minimum.

## Practical Rule

After every real usage test:

1. write or refresh the run summary JSON
2. rerun the normalizer
3. read the aggregate status before deciding whether the harness is ready for release

If the score is strong but still `provisional`, keep testing instead of releasing on confidence alone.
If the run used `one_prompt_recursive`, also review whether the delta was positive and whether critical hard fails were cleared.
If the run used `phase_runner_execution`, also review whether the engine evidence level is high enough to prove the harness actually drove the loop.
