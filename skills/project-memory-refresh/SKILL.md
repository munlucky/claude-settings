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

1. Resolve `projectId` through the Phase 01 Project Identity Resolver contract. Prefer `.claude/project.identity.yaml` and the account-root registry alias map, then fall back through canonical git remote, package name, git root basename, and path hash.
2. Run `node <MOONSHOT_RELAY_HOME>/scripts/memorygraph-project-index.mjs` from the current project root. The default `--analysis-level code` indexes existing code at file, import, symbol, class, function, type, and API/route-surface level.
3. Confirm the default seed/cache paths under the current Moonshot Relay state root:
   - `.moonshot-relay/cache/memorygraph/project-graph-seed.json`
   - `.moonshot-relay/cache/memorygraph/promotion-candidates.json`
4. Invoke `project-memory-refresh` with `memoryMode: write_requested`.
5. Report created/skipped node and relationship counts.

## Codex MCP Transport Fallback

If the existing Memory MCP tool attached to Codex Desktop fails with `Transport closed`, do not ask for a Codex restart. Run the direct fallback instead:

```bash
node <MOONSHOT_RELAY_HOME>/scripts/memorygraph-direct.mjs health
node <MOONSHOT_RELAY_HOME>/scripts/memorygraph-direct.mjs refresh-seed --max-nodes 200
```

On Windows, if the sandbox blocks `memorygraph.exe`, rerun the same command with an approval-based escalated shell. The direct fallback uses the current `.moonshot-relay/state/projects/<projectId>/knowledge/memorygraph` namespace by default. `.claude/memorygraph/` is legacy project-local compatibility only.

## Boundaries

- Resolve durable project identity/state through the Project Identity Resolver and account-root namespace.
- Treat `.claude/memorygraph/` and `.claude/cache/memorygraph/` as legacy project-local compatibility/cache artifacts.
- Do not read `.moonshot-relay/docs/ko/` as a memory source.
- Do not commit `.claude/memorygraph/` or `.claude/cache/memorygraph/`.
- If MemoryGraph is unavailable, try the direct fallback first, then report the failure and leave the workflow unblocked.

## Harness Promotion

This skill may generate promotion candidates, but it must not store them in `moonshot-relay`. Use `harness-memory-promoter` from the harness repository after explicit approval.

## Project Knowledge Boundary

`project-memory-refresh` is a seed/write boundary, not a prompt assembly step. It may refresh project knowledge inputs for later `knowledge-context-build.mjs` runs, but it must not inject raw MemoryGraph/KG/ontology records into orchestrator prompts.

Unavailable MemoryGraph remains non-blocking unless the user explicitly requested a strict memory refresh. The durable output is typed knowledge state plus audit evidence; the prompt-facing output is still only `projectKnowledgeContext` summary metadata.
