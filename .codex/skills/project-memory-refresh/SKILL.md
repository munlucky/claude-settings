---
name: project-memory-refresh
description: Explicitly build and refresh the current project's local MemoryGraph knowledge graph.
triggers:
  - "memory refresh"
  - "project memory refresh"
  - "build project knowledge graph"
---

# Project Memory Refresh

Use this skill only when the user explicitly asks to refresh, build, or update the project knowledge graph.

## Required Flow

1. Derive `projectId` from `package.json` name, then directory name.
2. Run `node .claude/scripts/memorygraph-project-index.mjs` from the current project root. The default `--analysis-level code` indexes existing code at file, import, symbol, class, function, type, and API/route-surface level.
3. Confirm the seed paths:
   - `.claude/cache/memorygraph/project-graph-seed.json`
   - `.claude/cache/memorygraph/promotion-candidates.json`
4. Invoke `project-memory-refresh` with `memoryMode: write_requested`.
5. Report created/skipped node and relationship counts.

## Codex MCP Transport Fallback

If the existing Memory MCP tool attached to Codex Desktop fails with `Transport closed`, do not ask for a Codex restart. Run the direct fallback instead:

```bash
node .claude/scripts/memorygraph-direct.mjs health
node .claude/scripts/memorygraph-direct.mjs refresh-seed --seed .claude/cache/memorygraph/project-graph-seed.json --max-nodes 200
```

On Windows, if the sandbox blocks `memorygraph.exe`, rerun the same command with an approval-based escalated shell. The direct fallback sets `MEMORY_SQLITE_PATH` to `.claude/memorygraph/memory.db`, so writes stay in the current project's local graph.

## Boundaries

- Write only to the current project's `.claude/memorygraph/`.
- Do not read `.claude/docs/ko/` as a memory source.
- Do not commit `.claude/memorygraph/` or `.claude/cache/memorygraph/`.
- If MemoryGraph is unavailable, try the direct fallback first, then report the failure and leave the workflow unblocked.

## Harness Promotion

This skill may generate promotion candidates, but it must not store them in `claude-settings`. Use `harness-memory-promoter` from the harness repository after explicit approval.
