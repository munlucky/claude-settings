---
name: moonshot-phase-executor
description: Skill-level phase execution adapter that routes prepared phase work to in-session coordinator execution, with delegated-terminal kept as legacy compatibility only.
surfaceStatus: internal_stage_owner
triggers:
  - "phase executor"
  - "phase execution adapter"
---

# Moonshot Phase Executor

## Role

Serve as the skill-first execution boundary after `moonshot-phase-runner`.
Users should not need to run command adapters directly. This skill consumes `phaseRunnerResult`, then routes execution to:
- `moonshot-in-session-coordinator` as the default active execution path
- `moonshot-phase-dispatch.mjs` / `agent-loop.mjs` only for explicit legacy/headless compatibility maintenance

This is an internal execution handoff, not a primary public workflow entrypoint.
Users should normally start from `moonshot-phase-runner`, not this skill.

## Legacy Adapter Policy

`delegated-terminal`, `moonshot-phase-dispatch.mjs`, `agent-loop.mjs`, and their shell wrappers are legacy adapters. They are not installed as part of the active runtime workflow payload and must not be selected automatically. Use them only when all of the following are true:
- the user or maintainer explicitly asks to validate or repair the legacy adapter path
- the local checkout has the legacy scripts available
- the run records `legacyAdapterReason`
- the result is treated as compatibility evidence, not the default phase-runner contract

## Inputs

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator" # delegated-terminal is legacy only
  planDir: "docs/implementation/"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  worksetTemplate: "<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md"
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  legacyAdapterReason: ""             # required when executionMode == delegated-terminal
```

## Workflow

### 1. Respect prepare-only mode

If `prepareOnly == true`:
- do not execute anything
- surface the prepared status and optional adapter command

### 2. Route by execution mode

Before routing, confirm `phaseRunnerResult.projectKnowledgeContext` exists. If missing, run `knowledge-context-build.mjs --stage execute --json` from the current project root and pass only `projectKnowledgeContext.promptBlock` plus status-only metadata to the execution path.

If `executionMode == in-session-coordinator`:
- invoke `/moonshot-in-session-coordinator`
- pass through `phaseRunnerResult`
- when the active runtime cannot reliably keep spawning fresh attempts, stop with a concrete blocker or ask for a runtime change; do not silently fall back to delegated-terminal
- ensure each active slice can initialize `WORKSET.md` from `<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md`
- do not stop after a completed phase while the active plan directory still has another actionable phase
- do not treat a review-pending or finish-pending slice as complete; force another attempt until the artifacts reflect a real review and clean closeout

If `executionMode == delegated-terminal`:
- require non-empty `legacyAdapterReason`
- confirm the local checkout has `moonshot-phase-dispatch.mjs` / `agent-loop.mjs`
- run it only as a legacy compatibility check or explicit maintainer repair path
- do not present the result as the default phase-runner execution contract

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
- Apply `docs/public/guidelines/memorygraph-workflow.md` before dispatching execution.
- Do not pass raw MemoryGraph/KG/ontology records to dispatcher/agent-loop/coordinator inputs; pass summarized `projectKnowledgeContext` only.
- Use one compact MemoryGraph/CodeReviewGraph recall per stage by default; repeat only for missing owner/date/path/API/schema/failure facts, then stop when answerable.
- Default `modelEffortProfile` is `standard`; `deep` and `max` require a concrete `Effort escalation reason` in QA and workflow evidence.
- Do not ask the user to choose a model. The provider-neutral model router selects per-stage runtime model/effort and records the selected provider/model/effort in execution evidence.
- Preserve assistant-item `phase` values when replaying assistant history (`commentary` for progress, `final_answer` only after completion); never add phase metadata to user messages.
- Legacy scripts are compatibility adapters only and must stay behind explicit maintainer intent.
- `moonshot-phase-runner` should auto-start this skill by default unless `prepareOnly == true`.
- Do not ask the user to manually run `moonshot-phase-dispatch.mjs` in the default path.
- Do not auto-select `delegated-terminal` as a fallback from the active path.
- `review pending`, `workflow-review-bundle-missing`, `finish-closeout-incomplete`, or placeholder closeout artifacts are not valid completion states.
- The valid success boundary is plan-directory completion: every actionable phase completed or an explicit loop stop condition recorded.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `archive/scripts/legacy-phase-adapters/agent-loop.mjs` as a legacy compatibility adapter
- `archive/scripts/legacy-phase-adapters/moonshot-phase-dispatch.mjs` as a legacy compatibility adapter
- `archive/scripts/legacy-phase-adapters/agent-loop.sh` / `archive/scripts/legacy-phase-adapters/moonshot-phase-dispatch.sh` as legacy wrappers
- `<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md`

## Project Knowledge Context Contract

Before routing to in-session coordinator or forked-agent execution, confirm `phaseRunnerResult.projectKnowledgeContext` exists. If missing, run `knowledge-context-build.mjs --stage execute --json` and pass only `projectKnowledgeContext.promptBlock` and status-only metadata.

This executor must not bypass the context builder. Coordinator and attempt manifests may record only knowledge status metadata, never raw MemoryGraph/KG/ontology/log/transcript payloads. Legacy dispatcher/agent-loop runs must follow the same summary-only knowledge rule when explicitly used.
