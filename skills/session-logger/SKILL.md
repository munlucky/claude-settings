---
name: session-logger
description: Record decisions, issues, and handoff notes during or after work.
layer: agent_extending
loads:
  - session-state
  - handoff-artifacts
deepReferences:
  - .moonshot-relay/docs/solutions/README.md
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
- correction lesson: user correction, reusable pattern, affected guardrail, and whether a durable update was made or skipped
- completion: verification result and next step

## Operating rules

- keep active logs under the document memory ceilings
- move long timelines and raw review detail to archive
- keep `HANDOFF.md` summary-first and artifact-reference-first
- before finish/handoff logging, build or refresh `projectKnowledgeContext` with `knowledge-context-build.mjs --stage finish --json`
- record only compact knowledge status, warning codes, artifact references, and reusable decisions; never paste raw MemoryGraph/KG/ontology/log/transcript payloads into session logs or `HANDOFF.md`
- when the user explicitly asks for graph refresh, run `project-memory-refresh`; otherwise finish logging remains read-only and may create promotion candidates only
- use knowledge writes only for reusable decisions, corrections, fixes, or project-specific conventions that pass the verify/promote lifecycle
- do not use `.moonshot-relay/docs/ko/` as a MemoryGraph source; it is a human-facing Korean mirror
- promote reusable remediation patterns to `.moonshot-relay/docs/solutions/` when justified
- create harness promotion candidates only; do not write promoted facts into `moonshot-relay` without explicit approval
- append correction events instead of rewriting prior history

## Project Knowledge Context Contract

Session logs and handoff docs may reference compact `projectKnowledgeContext` status and provenance refs, but they are not a raw knowledge export surface. Keep account-root project knowledge state out of repo docs unless the artifact is a reviewed summary, evidence manifest, or explicit promotion candidate.

## References

- [Session Compaction](docs/public/guidelines/session-compaction.md)
- [Session Logger Reference](docs/public/reference/session-logger-reference.md)
- [rules/docs/documentation.md](rules/docs/documentation.md)
- [rules/communication.md](rules/communication.md)
- [rules/output-format.md](rules/output-format.md)
