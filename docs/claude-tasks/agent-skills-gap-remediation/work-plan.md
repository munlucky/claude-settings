# Workflow And Meta-Harness Improvement Plan

## Objective

Improve the Moonshot execution workflow and extend it toward a self-optimizing meta-harness loop.

This plan still excludes:

1. repository license work
2. CI/bootstrap setup work
3. installer/distribution hardening

The focus is:

- orchestration correctness
- planning and execution handoff
- workflow evidence and completion state
- harness introspection and trace capture
- automated harness optimization loops

## Current-State Evidence

- `moonshot-orchestrator` embeds a very large `analysisContext` contract directly in the skill body.
- `moonshot-decide-sequence` repeats a second version of the same shared schema and bundle rules.
- `workflow-enforcement.mjs` and `agent-loop-phase-state.mjs` both infer workflow completion from `selectedBundles`, `requiredSkills`, and `stageOrder`.
- `moonshot-phase-dispatch.mjs` injects phase path authority and stage contract rules inline into the prompt text.
- Phase execution behavior is split across skill docs, dispatch scripts, workflow enforcement, and phase-state evaluation.
- The current harness already records logs and phase artifacts, but it does not yet operate a dedicated proposer loop that diagnoses traces and patches harness behavior.

## What Should Be Preserved

- public entrypoints stay simple: `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`
- strict workflow evidence remains mandatory for meta-harness work
- product-definition handoff remains the boundary before implementation
- review -> verify -> finish ordering remains enforced for meaningful code changes
- long-running execution continues to use bridge artifacts such as `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, and `SCORECARD.md`

## Part A. Workflow-Centered Improvements

### 1. Extract `analysisContext` Into A Real Contract

Problem:

- the core task schema lives inside long skill markdown and is duplicated across files
- updates to one copy can silently drift from the others

Evidence:

- [moonshot-orchestrator/SKILL.md](/Users/dev/claude-settings/.claude/skills/moonshot-orchestrator/SKILL.md) defines the main schema
- [moonshot-decide-sequence/SKILL.md](/Users/dev/claude-settings/.claude/skills/moonshot-decide-sequence/SKILL.md) repeats the shared schema

Recommendation:

- move the canonical schema to `.claude/schemas/analysis-context.schema.yaml`
- keep only a short reference block in the skills
- define required fields by execution plane: `read_only`, `product_project`, `meta_harness`
- define artifact path fields separately from signal fields

Expected gain:

- less prompt bloat
- lower drift risk between orchestrator and routing logic
- easier future validation of downstream artifacts

### 2. Turn Bundle Selection Into Data, Not Prose

Problem:

- bundle choice is currently encoded in markdown rules plus script-side assumptions
- the routing policy is hard to diff and harder to test

Evidence:

- [moonshot-decide-sequence/SKILL.md](/Users/dev/claude-settings/.claude/skills/moonshot-decide-sequence/SKILL.md) contains the bundle matrix
- [workflow-enforcement.mjs](/Users/dev/claude-settings/.claude/scripts/workflow-enforcement.mjs) assumes specific bundles must appear in evidence
- [agent-loop-phase-state.mjs](/Users/dev/claude-settings/.claude/scripts/agent-loop-phase-state.mjs) also checks for review/finish bundles during completion

Recommendation:

- create `.claude/config/workflow-bundles.yaml`
- encode:
  - plane rules
  - complexity rules
  - strict overlays
  - required terminal bundles
  - allowed parallel groups
- make `moonshot-decide-sequence`, `workflow-enforcement`, and phase-state consumers read the same registry

Expected gain:

- one source of truth for routing
- fewer mismatches between selected bundles and enforcement logic
- easier addition of new workflow profiles without editing several files

### 3. Separate Planning Baseline From Execution Baseline

Problem:

- current flow mixes “planning artifacts exist” with “execution slice is ready to run”
- this makes medium/complex handoff rules harder to reason about

Evidence:

- `productPackageReady`, `hasExecutionPlan`, `implementationReady`, `sprintContractReady`, and `phaseAttemptMode` interact across the orchestrator and routing skill

Recommendation:

- formalize two gates:
  - `planningReady`
  - `executionReady`
- `planningReady` means the package is sufficient to choose a chain
- `executionReady` means the active slice has `SPRINT_CONTRACT.md` and artifact paths resolved
- stop deriving execution readiness from mixed booleans spread across `signals`

Expected gain:

- clearer handoff from product definition to implementation
- fewer ambiguous transitions for medium/complex tasks
- easier retry behavior because the active execution baseline is explicit

### 4. Make Phase Evidence A First-Class Artifact Model

Problem:

- workflow evidence is partly written into analysis YAML, partly inferred from QA/handoff docs, and partly re-parsed from logs
- completion logic depends on several parallel representations

Evidence:

- [workflow-enforcement.mjs](/Users/dev/claude-settings/.claude/scripts/workflow-enforcement.mjs) writes and validates `workflowEvidence`
- [agent-loop-phase-state.mjs](/Users/dev/claude-settings/.claude/scripts/agent-loop-phase-state.mjs) recalculates completion permission from evidence plus QA content

Recommendation:

- introduce a dedicated machine-readable artifact such as `.claude/logs/workflow-enforcement/current-run.json`
- record:
  - selected bundles
  - required skills
  - applied skills
  - skipped skills
  - stage order
  - current stage
  - completion blockers
  - closeout status
- treat markdown docs as human-readable outputs, not the only source for state reconstruction

Expected gain:

- phase-state logic becomes simpler
- fewer parsing edge cases from markdown drift
- closeout and retry decisions become more deterministic

### 5. Shrink Prompt-Time Contract Injection In Phase Dispatch

Problem:

- `moonshot-phase-dispatch.mjs` injects a long contract block into the coordinator prompt on every run
- that contract overlaps with rules already expressed elsewhere

Evidence:

- path authority and stage contract are assembled inline in the dispatcher prompt

Recommendation:

- move the reusable contract into a dedicated prompt asset, for example `.claude/templates/execution/PHASE_COORDINATOR_CONTRACT.md`
- inject only run-specific values:
  - `phaseStatusFile`
  - `planDir`
  - `executionRoot`
  - active phase artifact paths
- keep global rules in the asset and runtime variables in the dispatcher

Expected gain:

- simpler dispatcher code
- lower risk of contract drift between runs
- cleaner review surface for execution-policy changes

### 6. Tighten Entry Boundary Between Public Skills And Internal Micro-Skills

Problem:

- public entrypoints are conceptually clean, but the internal routing surface is still spread across several skills and scripts
- it is too easy for future changes to leak internal assumptions into public usage

Recommendation:

- define a small public contract per entrypoint:
  - accepted input state
  - expected outputs
  - next-hop rules
- define a matching internal contract for each micro-skill class:
  - analysis
  - routing
  - gating
  - implementation
  - verification
  - finish
- store this in `.claude/docs/guidelines/workflow-contracts.md`

Expected gain:

- safer future refactors
- less accidental expansion of public entrypoints
- easier onboarding for contributors changing the harness

### 7. Normalize Completion Semantics

Problem:

- “done”, “clean finish”, “allowed to complete”, and “handoff required” are close but not identical states
- they are enforced across several artifacts and scripts

Evidence:

- `workflow-enforcement` validates evidence
- `agent-loop-phase-state` decides `PHASE_COMPLETION_ALLOWED`
- handoff and QA documents still carry closeout meaning in prose sections

Recommendation:

- standardize completion into explicit machine states:
  - `blocked`
  - `retry_required`
  - `verification_pending`
  - `handoff_ready`
  - `complete`
- map each state to required artifacts and allowed next actions
- keep markdown closeout text as explanation, not the primary state machine

Expected gain:

- less ambiguity in long-running sessions
- cleaner handoff behavior after verification warnings or partial review
- fewer cases where the loop appears complete but is not actually closeable

## Part B. Meta-Harness Auto-Optimization Improvements

### 8. Build A Trace Corpus For Every Harness Attempt

Problem:

- current logs are useful for debugging, but the harness does not yet expose a normalized attempt corpus designed for automated diagnosis

Recommendation:

- define a per-attempt trace bundle under `.claude/logs/meta-harness/<run-id>/`
- capture:
  - resolved input prompt
  - selected runtime and mode
  - tool calls or shell commands
  - stdout/stderr summaries
  - artifact deltas
  - verifier results
  - stop reason
  - completion gate reason
- add a trace manifest so a later optimizer can ingest the bundle without re-parsing ad hoc logs

Expected gain:

- reproducible post-mortem analysis
- direct substrate for automated proposer loops
- easier comparison between failed, retried, and successful runs

### 9. Add A Proposer/Diagnoser Loop For Harness Code

Problem:

- today the harness can retry task execution, but it does not systematically inspect its own traces and patch harness logic

Recommendation:

- introduce a bounded optimizer flow:
  - `trace collector`
  - `counterfactual diagnoser`
  - `proposer`
  - `patch evaluator`
- the diagnoser should answer:
  - where did the attempt stall
  - what signal was missing
  - which harness rule or parser should have behaved differently
- keep this loop scoped to harness code only: `.claude/scripts`, `.claude/skills`, `.claude/templates`, `.claude/docs/guidelines`

Expected gain:

- turns the harness into a system that improves from prior traces instead of only from manual review
- aligns directly with the meta-harness report’s strongest mechanism

### 10. Add Stuck-State Recovery Playbooks To Harness Prompts

Problem:

- when the runner gets stuck, the harness has retry logic but not a curated library of failure-mode-specific recovery heuristics

Recommendation:

- define a stuck-state catalog in `.claude/docs/guidelines/harness-recovery-playbook.md`
- include cases such as:
  - empty command output
  - missing expected artifact
  - verifier produced no usable evidence
  - prompt drift into unrelated repo inspection
  - repeated no-op retries
- feed the relevant recovery snippet into agent-loop prompts only when the matching failure mode is detected

Expected gain:

- fewer blind retries
- more deterministic recovery behavior
- better use of context budget because only relevant recovery guidance is injected

### 11. Optimize Tool And Command Contracts For Diagnosability

Problem:

- many harness failures are not first-order task failures; they are failures of ambiguous tool usage, unclear errors, or weak adapter contracts

Recommendation:

- standardize tool and script outputs into machine-friendly shapes
- ensure key scripts emit:
  - error code
  - normalized reason
  - suggested remediation class
  - artifact path when relevant
- improve adapter prompts and tool descriptions around runtime resolution, verification selection, and artifact handling

Expected gain:

- proposer loop can infer root causes faster
- less brittle parsing when analyzing terminal traces
- easier structured comparison across attempts

### 12. Strengthen Completion-Checking With Artifact Cross-Validation

Problem:

- current completion logic is already strong, but it still reconstructs truth from multiple partial sources

Recommendation:

- add an explicit completion-check module that cross-validates:
  - claimed changed files
  - verifier verdict
  - QA next path
  - handoff closeout state
  - scorecard verdict
  - workflowEvidence state
- record both:
  - binary closeability
  - dimension-level reasons for failure

Expected gain:

- fewer premature “done” states
- clearer auto-remediation prompts
- direct compatibility with optimizer benchmarking

### 13. Add Saliency-Based Context Trimming For Long Runs

Problem:

- long autonomous runs produce too much output for later diagnosis, but naive truncation hides the useful failure context

Recommendation:

- add a trimming policy for logs and attempt summaries
- preserve:
  - lines around errors
  - last successful checkpoint before failure
  - artifact writes
  - verifier transitions
- compress:
  - repeated success output
  - duplicated environment banners
  - repetitive polling logs
- emit both a raw log path and a trimmed diagnosis view

Expected gain:

- lower analysis cost for proposer loops
- easier human inspection of failures
- better signal density in long-running attempts

### 14. Introduce Benchmark-Driven Harness Evolution

Problem:

- workflow improvements may feel correct locally but still fail to improve harness effectiveness systematically

Recommendation:

- define a benchmark runner for harness changes
- compare candidate harness revisions on:
  - completion rate
  - retry count
  - verifier failure categories
  - completion lead time
  - context size / trimmed trace size
- use existing observability fields such as `teamMetrics.retryCount`, `verifierFailureCategories`, and `completionLeadTimeSeconds` as the initial score substrate

Expected gain:

- improvement work becomes measurable
- proposer loop can rank patches instead of guessing
- harness changes stop being purely anecdotal

### 15. Add A Safe Optimization Boundary

Problem:

- a self-modifying harness can easily destabilize itself if it patches too broadly

Recommendation:

- define explicit optimization boundaries in `.claude/docs/guidelines/meta-harness-optimization.md`
- optimizer may propose changes only to:
  - harness scripts
  - harness templates
  - skill contracts
  - non-user project docs under `.claude/docs`
- optimizer may not mutate:
  - user repository code outside harness scope
  - secrets or runtime credentials
  - unrelated downstream task artifacts
- require a candidate patch to pass harness-local validation before adoption

Expected gain:

- makes self-optimization safer
- protects downstream project work from optimizer noise
- enables controlled experimentation

## Recommended Execution Order

### Slice A. Workflow Contract Extraction

- extract `analysisContext` schema
- extract workflow bundle registry
- update orchestrator and decide-sequence to reference those files

Why first:

- this removes the main source of workflow drift without changing behavior yet

### Slice B. Workflow Evidence And Completion Model

- add a dedicated workflow state artifact
- update workflow-enforcement and phase-state to consume it
- normalize completion states

Why second:

- this stabilizes execution and completion handling before optimizer work begins

### Slice C. Planning vs Execution Gate Split

- add `planningReady` and `executionReady`
- simplify readiness logic in the orchestrator and routing rules

Why third:

- the optimizer should operate on a cleaner state model, not the current mixed readiness signals

### Slice D. Dispatcher Contract Slimming

- move reusable coordinator contract text into a template asset
- keep only runtime substitution in the dispatcher

Why fourth:

- this reduces prompt noise and creates clearer injection points for future recovery playbooks

### Slice E. Trace Corpus And Diagnosis View

- add per-attempt trace bundles
- add trimmed diagnosis views
- map stop reasons and verifier failures into normalized codes

Why fifth:

- proposer-style optimization only works once traces are explicit and analyzable

### Slice F. Proposer Loop And Recovery Playbooks

- add counterfactual diagnoser
- add proposer flow
- add stuck-state playbook injection
- tighten tool/error contracts

Why sixth:

- this is the first step where the harness actively improves itself instead of only executing work

### Slice G. Benchmark And Safe Optimization Boundary

- add benchmark runner
- score candidate harness revisions
- document optimization boundary and adoption rules

Why last:

- measurement and governance should lock in after the basic optimizer loop exists

## Concrete File Targets

- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.ko.md`
- `.claude/skills/moonshot-decide-sequence/SKILL.md`
- `.claude/skills/moonshot-decide-sequence/SKILL.ko.md`
- `.claude/skills/moonshot-phase-runner/SKILL.md`
- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/workflow-enforcement.mjs`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/agent-loop-phase-runner.mjs`
- `.claude/scripts/agent-loop-phase-state.mjs`
- `.claude/scripts/agent-loop-phase-attempt.mjs`
- `.claude/templates/execution/PHASE_COORDINATOR_CONTRACT.md`
- `.claude/config/workflow-bundles.yaml`
- `.claude/schemas/analysis-context.schema.yaml`
- `.claude/docs/guidelines/workflow-contracts.md`
- `.claude/docs/guidelines/harness-recovery-playbook.md`
- `.claude/docs/guidelines/meta-harness-optimization.md`
- `.claude/scripts/meta-harness-trace.mjs`
- `.claude/scripts/meta-harness-proposer.mjs`
- `.claude/scripts/meta-harness-benchmark.mjs`

## Success Criteria

- `analysisContext` schema exists once as the canonical contract
- bundle selection rules are defined once and reused by routing and enforcement
- phase completion no longer depends on reconstructing state from multiple markdown sources
- planning handoff and execution readiness are distinct and explicit
- dispatcher prompt construction is shorter and less policy-heavy
- every phase attempt can emit a normalized trace bundle
- the harness can generate diagnosis-ready summaries from those traces
- a bounded proposer loop can suggest harness patches based on prior traces
- completion checks expose structured failure reasons, not only pass/fail
- benchmark scoring can compare harness revisions on completion quality and efficiency
