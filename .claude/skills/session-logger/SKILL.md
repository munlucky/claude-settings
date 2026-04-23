---
name: session-logger
description: Record decisions, issues, and handoff notes during or after work.
layer: agent_extending
loads:
  - session-state
  - handoff-artifacts
deepReferences:
  - .claude/docs/solutions/README.md
outputArtifacts:
  - HANDOFF.md
  - session-log
  - solution-asset
---

# Session Logger Skill

Use this skill when the user explicitly wants session or handoff logging, or when a workflow reaches a finish/handoff stage.

## Purpose

- keep active session state resumable
- record decisions, issues, and next steps
- prefer compact summaries over long timelines

## Default outputs

- prefer `docs/daily/YYYY-MM-DD/{runtime}.md` when the repo uses `docs/daily/README.md`
- otherwise use `{tasksRoot}/{feature-name}/session-logs/day-YYYY-MM-DD.md`
- handoff target is `analysisContext.artifacts.handoffPath` or `{tasksRoot}/{feature-name}/HANDOFF.md`

## Minimum logging contract

- work start: goal, branch, initial scope
- decision: short reason and chosen path
- issue: problem, fix, rerun signal
- completion: verification result and next step

## Operating rules

- keep active logs under the document memory ceilings
- move long timelines and raw review detail to archive
- keep `HANDOFF.md` summary-first and artifact-reference-first
- if Memory MCP is configured, record only compact reusable facts
- promote reusable remediation patterns to `.claude/docs/solutions/` when justified

## References

- [Session Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [Session Logger Reference](/Users/dev/claude-settings/.claude/docs/reference/session-logger-reference.md)
- [/Users/dev/claude-settings/.claude/rules/docs/documentation.md](/Users/dev/claude-settings/.claude/rules/docs/documentation.md)
- [/Users/dev/claude-settings/.claude/rules/communication.md](/Users/dev/claude-settings/.claude/rules/communication.md)
- [/Users/dev/claude-settings/.claude/rules/output-format.md](/Users/dev/claude-settings/.claude/rules/output-format.md)
