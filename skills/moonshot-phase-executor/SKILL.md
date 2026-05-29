---
name: moonshot-phase-executor
description: Skill-level phase execution adapter that routes prepared phase work to delegated-terminal or in-session coordinator execution.
surfaceStatus: internal_stage_owner
triggers:
  - "phase executor"
  - "phase execution adapter"
---

# Moonshot Phase Executor

## Role

Serve as the skill-first execution boundary after `moonshot-phase-runner`.
Users should not need to run command adapters directly. This skill consumes `phaseRunnerResult`, then routes execution to:
- `moonshot-phase-dispatch.mjs` / `agent-loop.mjs` as the primary internal adapter path for `delegated-terminal`
- `moonshot-in-session-coordinator` for `in-session-coordinator`

This is an internal execution handoff, not a primary public workflow entrypoint.
Users should normally start from `moonshot-phase-runner`, not this skill.

## Inputs

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "delegated-terminal" # or in-session-coordinator
  planDir: "docs/implementation/"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  worksetTemplate: ".claude/templates/execution/WORKSET.template.md"
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  executionCommand: "node .claude/scripts/moonshot-phase-dispatch.mjs ..."
  executionAdapterCommand: "node .claude/scripts/agent-loop.mjs ..."
```

## Workflow

### 1. Respect prepare-only mode

If `prepareOnly == true`:
- do not execute anything
- surface the prepared status and optional adapter command

### 2. Route by execution mode

Before routing, confirm `phaseRunnerResult.projectKnowledgeContext` exists. If missing, run `knowledge-context-build.mjs --stage execute --json` from the current project root and pass only `projectKnowledgeContext.promptBlock` plus status-only metadata to the execution path.

If `executionMode == delegated-terminal`:
- call `phaseRunnerResult.executionCommand` immediately in the current session
- forward runtime selection (`auto|claude|codex`)
- keep this hidden behind the skill boundary
- stay attached to the delegated-terminal process until it exits
- allow the delegated-terminal loop to auto-select safe phase-level parallel waves through `phase-parallel-planner.mjs`; do not ask the user for a phase parallelism count
- if the phase-wave coordinator falls back, continue with the existing sequential next-phase loop instead of treating fallback as user-visible failure
- do not substitute a single implementation attempt, partial checkpoint, or conversational summary for the real loop
- if the loop leaves the current phase `in_progress` with `lastOutcome=partial` or `score.verdict=retry`, keep following the delegated-terminal path instead of returning early
- if the loop marks one phase `completed` but the active plan directory still has any actionable phase, keep the same delegated-terminal execution boundary and continue
- if completion gates report missing review evidence or incomplete finish-closeout, do not return success; stay in the loop and remediate those missing steps first

If `executionMode == in-session-coordinator`:
- invoke `/moonshot-in-session-coordinator`
- pass through `phaseRunnerResult`
- when the active runtime cannot reliably keep spawning fresh attempts, prefer a runtime-side fallback to `delegated-terminal` instead of pretending the run is fully autonomous
- ensure each active slice can initialize `WORKSET.md` from `.claude/templates/execution/WORKSET.template.md`
- do not stop after a completed phase while the active plan directory still has another actionable phase
- do not treat a review-pending or finish-pending slice as complete; force another attempt until the artifacts reflect a real review and clean closeout

### 3. Runtime handling

- `executionRuntime == auto`
  - prefer Codex when available
  - otherwise use Claude
- `executionRuntime == claude`
  - run Claude-compatible path
- `executionRuntime == codex`
  - run Codex-compatible path

### 4. Result handling

Return summarized execution status only:

```yaml
phaseExecutionResult:
  started: true
  mode: "in-session-coordinator"
  runtime: "codex"
  status: "running"   # running | completed | failed | prepared_only
  nextBoundary: "moonshot-in-session-coordinator"
```

## Contract

- This skill is the internal phase execution handoff behind `moonshot-phase-runner`.
- Apply `.claude/docs/guidelines/memorygraph-workflow.md` before dispatching execution.
- Do not pass raw MemoryGraph/KG/ontology records to dispatcher/agent-loop/coordinator inputs; pass summarized `projectKnowledgeContext` only.
- Use one compact MemoryGraph/CodeReviewGraph recall per stage by default; repeat only for missing owner/date/path/API/schema/failure facts, then stop when answerable.
- Default `modelEffortProfile` is `standard`; `deep` and `max` require a concrete `Effort escalation reason` in QA and workflow evidence.
- Do not ask the user to choose a model. The provider-neutral model router selects per-stage runtime model/effort and records the selected provider/model/effort in execution evidence.
- Preserve assistant-item `phase` values when replaying assistant history (`commentary` for progress, `final_answer` only after completion); never add phase metadata to user messages.
- Scripts are implementation adapters only and must stay behind this skill.
- `moonshot-phase-runner` should auto-start this skill by default unless `prepareOnly == true`.
- Do not ask the user to manually run `moonshot-phase-dispatch.mjs` in the default path.
- For `delegated-terminal`, the valid execution boundary is the actual dispatcher/agent-loop process, not a one-round summary.
- `partial`, `retry`, updated QA artifacts, or a resumable handoff are not valid stop reasons for delegated-terminal by themselves.
- `review pending`, `workflow-review-bundle-missing`, `finish-closeout-incomplete`, or placeholder closeout artifacts are not valid completion states.
- The valid success boundary is plan-directory completion: every actionable phase completed or an explicit loop stop condition recorded.
- While the dispatcher lease is still active, progress reports must remain commentary-style; do not emit a `final` answer or session-ended wording from a mid-run checkpoint.
- In auto-start execution, a success return is valid only if `node .claude/scripts/phase-run-lease.mjs assert-return-allowed <status-file> <runLeaseId> true false` allows it. If the guard denies, keep the loop alive or fail as a contract violation instead of returning a summary.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/agent-loop.sh` / `.claude/scripts/moonshot-phase-dispatch.sh` as compatibility wrappers
- `.claude/templates/execution/WORKSET.template.md`

## Project Knowledge Context Contract

Before routing to delegated-terminal, in-session coordinator, or forked-agent execution, confirm `phaseRunnerResult.projectKnowledgeContext` exists. If missing, run `knowledge-context-build.mjs --stage execute --json` and pass only `projectKnowledgeContext.promptBlock` and status-only metadata.

This executor must not bypass the context builder. Dispatcher, agent-loop, coordinator, and attempt manifests may record only knowledge status metadata, never raw MemoryGraph/KG/ontology/log/transcript payloads.
