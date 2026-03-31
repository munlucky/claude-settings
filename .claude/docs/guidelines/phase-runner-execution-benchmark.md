# Phase-Runner Execution Benchmark

> Use this benchmark when the goal is to verify that the harness execution engine itself can drive a downstream project from PRD and phase plans, not merely that the project can be made to fit the harness document format.

Last-Reviewed: 2026-03-31

## Goal

Separate two different benchmark claims:

1. `contract_applied`
   - the downstream project was shaped to match the harness contract
   - documents, execution artifacts, and scoring files exist
   - implementation may still have been driven manually

2. `phase_runner_execution`
   - the downstream project started from product and phase plan artifacts
   - the phase runner or its concrete dispatch path selected the active phase
   - execution artifacts were used as the attempt input
   - the implementation loop progressed through the harness execution engine rather than through manual direct coding alone

This benchmark exists because `contract_applied` is not enough to prove that `.claude` actually drove the build.

## What Counts As A Real Execution-Engine Test

The run must satisfy all of these:

- downstream repo contains `PRD.md` and `docs/implementation/*`
- `.claude/docs/phase-status.yaml` exists
- `moonshot-phase-runner` or `moonshot-phase-dispatch.sh` is invoked against the downstream plan directory
- the active phase is resolved through the harness execution path
- `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, and `SCORECARD.md` are the active execution memory
- the benchmark report can show what the engine did versus what was manually patched outside the engine

If the repo only copies `.claude` and the implementation is then edited directly by hand, that is `contract_applied`, not `phase_runner_execution`.

## Benchmark Modes

Use one of these explicit `benchmarkMode` values in `harness-quality-run.json`:

- `standard`
- `one_prompt_recursive`
- `phase_runner_execution`

## Required Additional Documents

For `phase_runner_execution` runs, require:

- `PHASE_RUNNER_EXECUTION_REPORT.md`

This report should answer:

- what command or adapter path was invoked
- what phase the engine selected
- what execution artifacts were used as input
- what parts of the run were engine-driven
- what parts, if any, still required manual rescue

## Evidence Ladder

Treat evidence levels explicitly:

- `L0`: contract files exist only
- `L1`: dispatch dry-run resolves correctly
- `L2`: execution engine updates phase artifacts
- `L3`: execution engine materially advances implementation
- `L4`: execution engine completes a phase with passing verification

For release readiness, prefer `L3` or `L4`.

## Scoring Dimensions

In addition to project outcome, score the execution engine itself:

### 1. Dispatch Validity

- plan directory resolved correctly
- execution root resolved correctly
- phase status parsed correctly

### 2. Artifact-Driven Execution

- active phase pulled from `phase-status.yaml`
- `SPRINT_CONTRACT.md` used as attempt contract
- `QA_REPORT.md` and `HANDOFF.md` used for retry memory

### 3. Engine Contribution

- how much progress came from the phase runner path itself
- whether success depended mostly on manual bypass outside the engine

### 4. Phase Completion Fidelity

- phase status updated correctly
- completion artifacts match actual verification state

### 5. Recovery Fidelity

- failed phases trigger retry or handoff correctly
- closeout is not falsely declared

## Suggested Composite Score

For `phase_runner_execution` runs:

- dispatch validity: 20
- artifact-driven execution: 20
- engine contribution: 25
- phase completion fidelity: 20
- recovery fidelity: 10
- isolation discipline: 5

## Hard Fail Conditions

Count these as execution-engine hard fails:

- wrong phase selected
- phase declared done without passing evidence
- execution bypasses `SPRINT_CONTRACT.md`
- retry memory is not preserved in `QA_REPORT.md` / `HANDOFF.md`
- dispatch path fails before a usable attempt can start

## Relationship To One-Prompt Benchmark

The benchmarks are complementary:

- `one_prompt_recursive` measures product implementation quality and improvement delta
- `phase_runner_execution` measures whether `.claude` actually drove the loop

Release-readiness should eventually require both:

- at least one strong large-web `one_prompt_recursive` run
- at least one real `phase_runner_execution` run at evidence level `L3` or above

## Template

- `.claude/templates/execution/PHASE_RUNNER_EXECUTION_REPORT.template.md`

