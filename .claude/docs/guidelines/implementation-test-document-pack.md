# Implementation Test Document Pack

> Use this pack before running real implementation tests for harness evaluation.

Last-Reviewed: 2026-03-31

## Goal

Make each real implementation test reproducible, reviewable, and scoreable before any code is changed.

The document pack exists so the harness can answer:

- what exact test item was selected
- why the item matters for harness quality
- which workspace and isolation paths were used
- which execution artifacts must exist before the run can count toward normalization

## Required Pack

Every real implementation test should define these artifacts in order:

1. `IMPLEMENTATION_TEST_BRIEF.md`
2. `RUN_MANIFEST.md`
3. downstream execution artifacts
4. `harness-quality-run.json`

When the run mode is `one_prompt_recursive`, also require:

- `ONE_PROMPT_BASELINE.md`
- `RECURSIVE_IMPROVEMENT_REPORT.md`

Do not treat a run as normalization evidence unless all required artifacts exist.

## Artifact Roles

### 1. `IMPLEMENTATION_TEST_BRIEF.md`

Create this before any implementation work.

It should lock:

- `runId`
- selected test item
- execution plane
- project type
- complexity
- why this item improves the evidence set
- expected failing behavior to observe first
- required verification commands
- scoring focus for this run

This is the answer to "why are we running this exact test?"

### 2. `RUN_MANIFEST.md`

Create this immediately after the brief.

It should lock:

- source workspace or repo
- active branch and worktree
- candidate target if promotion is involved
- ignored artifact directories
- command list for setup, test, verify, and score
- expected execution artifacts
- clean-state checks for `main`

This is the answer to "how was this run isolated and executed?"

### 3. Downstream execution artifacts

Use the existing execution set inside the downstream project:

- `context.md`
- `execution/REQUIREMENTS_TRACEABILITY.md`
- `execution/SCENARIO_MATRIX.md`
- `execution/UAT_CHECKLIST.md`
- active slice `SPRINT_CONTRACT.md`
- active slice `QA_REPORT.md`
- active slice `SCORECARD.md`
- active slice `HANDOFF.md` when the run stops incomplete

These artifacts answer "what was implemented and what evidence was produced?"

### 4. `harness-quality-run.json`

Write the run summary only after verification is complete.

This is the normalization input and should summarize:

- final outcome
- verification status
- artifact completeness
- isolation discipline
- retry and handoff counts

For `one_prompt_recursive` runs, it should also summarize:

- `baselineScore`
- `finalScore`
- `deltaScore`
- hard-fail recovery outcome
- benchmark mode

## Directory Layout

Recommended structure:

```text
.tmp/harness-runs/<run-id>/
|-- IMPLEMENTATION_TEST_BRIEF.md
|-- RUN_MANIFEST.md
|-- harness-quality-run.json
`-- project/ or repo/
```

Keep downstream execution artifacts inside the copied project or fixture workspace, not beside the harness root.

## Gate Rules

Do not start implementation until:

- `IMPLEMENTATION_TEST_BRIEF.md` exists
- `RUN_MANIFEST.md` exists
- expected failing behavior is named
- required verification commands are listed

Do not count the run toward normalized harness quality until:

- `QA_REPORT.md` exists
- `SCORECARD.md` exists when score-based completion is used
- `harness-quality-run.json` exists
- `ONE_PROMPT_BASELINE.md` exists for `one_prompt_recursive` runs
- `RECURSIVE_IMPROVEMENT_REPORT.md` exists for `one_prompt_recursive` runs

## Test Item Selection Rule

A real test item should be chosen to improve evidence diversity, not just to maximize pass rate.

Prefer items that vary at least one of:

- execution plane
- project type
- complexity
- verification style
- failure mode or policy pressure

## Release Readiness Rule

Normalized quality should only be used for release readiness when:

- the document pack is complete for each counted run
- ignored artifact discipline was preserved
- `main` stayed clean
- sample threshold for release has been met
- at least one counted large-web run used the `one_prompt_recursive` benchmark design

## Templates

- `.claude/templates/execution/IMPLEMENTATION_TEST_BRIEF.template.md`
- `.claude/templates/execution/RUN_MANIFEST.template.md`
- `.claude/templates/execution/HARNESS_QUALITY_RUN.template.json`
- `.claude/templates/execution/ONE_PROMPT_BASELINE.template.md`
- `.claude/templates/execution/RECURSIVE_IMPROVEMENT_REPORT.template.md`
