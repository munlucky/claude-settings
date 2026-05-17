# MemoryGraph Workflow Contract

Use this contract for every public workflow entrypoint and every Moonshot stage boundary.

## Goals

- Query project-local MemoryGraph before a stage asks another skill, agent, or execution adapter to do work.
- Keep MemoryGraph context project-scoped with `context.project_path`, `context.project_id`, `project:<projectId>`, and `source:moonshot`.
- Avoid duplicating system, developer, `AGENTS.md`, `.claude/rules/**`, and workflow hard rules in the main session.
- Keep `.claude/docs/ko/` out of MemoryGraph load/store paths. It is a human-facing Korean mirror.
- Treat MemoryGraph failure as non-blocking unless the stage itself is a strict memory validation stage.
- Build and refresh project-local knowledge graphs only on explicit refresh, finish/session logging, or commit-memory flow.
- Promote reusable cross-project knowledge into the harness graph only through an approval-based promotion path.

## Stage Coverage

| Stage | Required MemoryGraph action | Owner |
|---|---|---|
| Intake | `project-memory-agent` read-only recall for prior decisions, domain terms, non-goals, and constraints. | public entrypoint |
| Plan | `project-memory-agent` read-only recall before product/phase/bounded planning tasks. | orchestrator |
| Ready / Isolate | `project-memory-check` read-only boundary check before implementation can start. | bundle / orchestrator |
| Execute | refresh stage-scoped `projectMemoryContext` before delegating implementation; pass only summarized deltas. | orchestrator / phase coordinator |
| Review | `project-memory-reviewer` after code review for boundary and convention regressions. | review stage |
| Verify | read-only recall for verification hints and release/closeout rules before final verification. | verification stage |
| Finish / Handoff | `session-logger` may store compact reusable facts; `commit-moonshot` refreshes memory when explicitly invoked. | finish stage |

## Project Graph Refresh

Project graph data belongs to the active project, not to `claude-settings`.

- Build seed: `node .claude/scripts/memorygraph-project-index.mjs`
- Seed output: `.claude/cache/memorygraph/project-graph-seed.json`
- Promotion candidates: `.claude/cache/memorygraph/promotion-candidates.json`
- Write path: `project-memory-refresh` with `memoryMode: write_requested`
- Data path: `<active-project>/.claude/memorygraph/`

The indexer creates semantic nodes and relationships from existing project files, package metadata, harness workflow assets, local references, imports, exported symbols, classes, functions, types, and API/route surfaces. It excludes `.claude/docs/ko/`, `.claude/memorygraph/`, `.git`, dependencies, and build/cache outputs.

## Harness Knowledge Promotion

Reusable project knowledge can be promoted into the `claude-settings` graph, but never automatically.

- Project refresh creates candidates only.
- `harness-memory-promoter` must run from the `claude-settings` repository.
- Promotion requires explicit approval.
- Promoted tags include `project:claude-settings`, `promoted`, `from-project:<projectId>`, and `source:moonshot`.
- Do not promote project domain/business logic, one-off implementation details, secrets, or facts derived only from `.claude/docs/ko/`.

## Dedupe Policy

MemoryGraph output must be reduced before merging into the main session:

```yaml
projectMemoryContext:
  deltas:
    boundaries: []
    conventions: []
    componentRules: []
    priorDecisions: []
    verificationHints: []
    graphRelations: []
  omitted:
    duplicatedSystemRules: []
    humanMirrorDocs:
      - ".claude/docs/ko/"
    staleOrLowConfidence: []
```

Do not copy raw memory text into `analysisContext`. Return only stage-specific deltas that can change the current decision.

## Read / Write Rules

- Default stage mode is `memoryMode: read_only`.
- Use `memoryMode: write_requested` only in `session-logger`, `commit-moonshot`, or an explicit memory-refresh request.
- Do not store generic harness rules, system prompt facts, or facts derived only from `.claude/docs/ko/`.
- If MemoryGraph is unavailable, set `boundaryStatus: not_checked` or add a warning and continue the workflow.

## Workflow Evidence

Each non-trivial workflow should record:

```yaml
projectMemory:
  backend: MemoryGraph
  stageCoverage:
    intake: checked | not_checked | skipped
    plan: checked | not_checked | skipped
    ready: checked | not_checked | skipped
    execute: checked | not_checked | skipped
    review: checked | not_checked | skipped
    verify: checked | not_checked | skipped
    finish: checked | not_checked | skipped
  lastStage: intake|plan|ready|execute|review|verify|finish|commit
```

For small compressed workflows, one `project-memory-agent` recall can cover adjacent stages only when the output explicitly names the covered stages.
