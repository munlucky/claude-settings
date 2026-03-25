---
name: moonshot-phase-executor
description: Skill-level phase execution adapter that routes prepared phase work to delegated-terminal or in-session coordinator execution.
triggers:
  - "phase executor"
  - "phase execution adapter"
---

# Moonshot Phase Executor

## Role

Serve as the skill-first execution boundary after `moonshot-phase-runner`.
Users should not need to run command adapters directly. This skill consumes `phaseRunnerResult`, then routes execution to:
- `agent-loop.sh` as an internal adapter for `delegated-terminal`
- `moonshot-in-session-coordinator` for `in-session-coordinator`

## Inputs

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "delegated-terminal" # or in-session-coordinator
  planDir: "docs/implementation/"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  executionCommand: ".claude/scripts/moonshot-phase-dispatch.sh ..."
  executionAdapterCommand: "bash .claude/scripts/agent-loop.sh ..."
```

## Workflow

### 1. Respect prepare-only mode

If `prepareOnly == true`:
- do not execute anything
- surface the prepared status and optional adapter command

### 2. Route by execution mode

If `executionMode == delegated-terminal`:
- call the internal adapter `agent-loop.sh`
- forward runtime selection (`auto|claude|codex`)
- keep this hidden behind the skill boundary

If `executionMode == in-session-coordinator`:
- invoke `/moonshot-in-session-coordinator`
- pass through `phaseRunnerResult`

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

- This skill is the user-facing phase execution handoff.
- Scripts are implementation adapters only and must stay behind this skill.
- `moonshot-phase-runner` should auto-start this skill by default unless `prepareOnly == true`.
- Do not ask the user to manually run `moonshot-phase-dispatch.sh` in the default path.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `.claude/scripts/agent-loop.sh`
- `.claude/scripts/moonshot-phase-dispatch.sh`
