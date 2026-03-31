# One-Prompt Recursive Benchmark

> Use this benchmark design when the harness should be judged on large full-stack web application work, not on small utility tasks.

Last-Reviewed: 2026-03-31

## Goal

Measure two different abilities without conflating them:

1. `one-prompt baseline`: how much of a large web project the harness can deliver from a single task prompt
2. `recursive improvement`: how much the harness improves the same project after reading failures, updating the execution loop, and retrying under the same benchmark contract

This benchmark is the preferred release-readiness benchmark for the Harness Project.

## Why This Exists

App-Bench-style tasks are strong at measuring one-shot delivery quality.

They are not sufficient on their own to measure recursive improvement because they answer only:

- what worked on the first generated version

They do not answer:

- how well failures were diagnosed
- whether the harness improved after seeing evidence
- how much score increased after bounded recursive retries

This benchmark keeps both views separate and then combines them.

## Target Work Shape

Use a `large` web project with both frontend and backend scope.

The default benchmark shape should include:

- authentication
- role or permission boundaries
- database-backed persistence
- frontend user flows across multiple screens
- backend API routes and validation
- failure handling
- browser/runtime verification
- at least one integration pressure point such as realtime sync, email, payment, search, or AI assistant flow

Avoid tiny CRUD-only tasks for this benchmark.

## Required Run Sequence

Each benchmark run should follow this order:

1. Define the benchmark task and rubric
2. Run the one-prompt baseline
3. Score the baseline with no recursive fixes counted yet
4. Run bounded recursive improvement rounds
5. Score the final validated state
6. Write the improvement report
7. Emit the normalization summary JSON

## Required Documents

In addition to the standard implementation test document pack, require:

- `ONE_PROMPT_BASELINE.md`
- `RECURSIVE_IMPROVEMENT_REPORT.md`

The baseline and recursive report are required when the run mode is `one_prompt_recursive`.

## Task Contract

The benchmark task should define:

- a single high-level product prompt
- a numbered functional rubric with objective pass/fail items
- allowed environment inputs such as API keys or seeded credentials
- explicit rule that the baseline run may not ask follow-up product questions
- explicit rule that architectural and technical choices are autonomous

## Benchmark Planes

Use at least one of these planes per counted run:

- `product_project`
- `meta_harness`

For release readiness, prefer `product_project` large web tasks.

## Scoring Model

Track these run-level scores separately:

### 1. One-Prompt Baseline Score

`baselineScore = passed baseline rubric items / total rubric items * 100`

This measures initial implementation power.

### 2. Final Validated Score

`finalScore = passed final rubric items / total rubric items * 100`

This measures end-state delivery after recursive improvement.

### 3. Recursive Improvement Delta

`deltaScore = finalScore - baselineScore`

This measures how much the harness improved the project after seeing evidence.

### 4. Hard-Fail Recovery

Track whether recursive rounds cleared these hard failures:

- app does not boot
- critical auth flow broken
- primary role flow unusable
- API contract non-functional
- persistent runtime errors on core path

### 5. Improvement Efficiency

Track the bounded attempt cost:

- recursive rounds used
- retry count
- handoff count

High delta with fewer rounds is better than the same delta with excessive retries.

## Recommended Composite Score

For large web benchmark runs, use this composite:

- one-prompt baseline: 35
- final validated score: 25
- recursive improvement delta: 20
- hard-fail recovery: 10
- verification integrity: 5
- isolation discipline: 5

Interpretation:

- strong baseline but weak delta means the harness starts well but does not learn well
- weak baseline but strong delta means the harness improves, but first-pass capability is weak
- strong final score with weak verification integrity should not be trusted

## Release Gate

Treat large web benchmark evidence as the primary release gate.

A release-ready harness should satisfy all of these:

- sample threshold met for normalization
- at least one large web benchmark run completed with full document pack
- no hard fail left open on the final validated score
- `main` remained clean
- one-prompt baseline is not catastrophically low
- recursive improvement produced measurable positive delta

Recommended release floor:

- `baselineScore >= 45`
- `finalScore >= 80`
- `deltaScore >= 15`
- hard-fail recovery complete on critical path

These numbers are a starting policy and may tighten later.

## Normalization View

Normalization should aggregate these separately:

- average `baselineScore`
- average `finalScore`
- average `deltaScore`
- hard-fail recovery rate
- verification integrity rate
- diversity across benchmark tasks

Do not collapse everything into a single score until the separate trends are visible.

## Suggested Benchmark Task Types

Good large-web benchmark families:

- multi-role operations dashboard
- marketplace or booking platform
- financial dashboard with realtime and auth
- support workspace with inbox, search, and threaded workflows
- admin portal with role-sensitive CRUD and audit history

## Templates

- `.claude/templates/execution/ONE_PROMPT_BASELINE.template.md`
- `.claude/templates/execution/RECURSIVE_IMPROVEMENT_REPORT.template.md`

