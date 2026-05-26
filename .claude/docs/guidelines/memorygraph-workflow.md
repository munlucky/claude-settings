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
- Phase 05 adds a replay gate before harness-memory-promoter: a candidate must have replay evidence or human approval, and transcript-only/imported-only candidates stay blocked.
- Turn-failure prevention memory is two-tiered: failed turn cases can feed local prevention briefs, while MemoryGraph writes require verified replay or explicit human approval.

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
- Commit refresh helper: `node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id <projectId>`
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
- MemoryGraph unavailable must not block unrelated workflows, but the promotion operation itself still reports failure or blockage.
- Promoted tags include `project:claude-settings`, `promoted`, `from-project:<projectId>`, and `source:moonshot`.
- Do not promote project domain/business logic, one-off implementation details, secrets, or facts derived only from `.claude/docs/ko/`.
- AWTL promotion candidates must include `failure_turn_id` when derived from a failed turn.
- Candidates created only from imported transcripts or raw trace replay are denied until replay evidence or human approval exists.
- Direct MemoryGraph writes are only valid with `writeMemoryGraph: true` and `autoPromote: verified-only`.
- Promotion attempts must append replay scorecard entries with `write_status`, `denial_codes`, and compact provenance.
- `write_status: skipped`, `not_requested`, or `memorygraph_unavailable` is not a workflow completion failure unless the phase objective is strict memory validation.

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
- Use `memoryMode: verified_write_requested` only for approved harness-memory-promoter flows that already passed replay or human approval.
- Do not store generic harness rules, system prompt facts, or facts derived only from `.claude/docs/ko/`.
- If MemoryGraph is unavailable, set `boundaryStatus: not_checked` or add a warning and continue the workflow.
- In `commit-moonshot`, `Transport closed` is classified as `mcp_transport_failed -> direct_fallback`; direct fallback success completes memory refresh, and direct fallback failure is logged without blocking an explicit Git closeout.

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
