# Commit Moonshot Reference

## Minimal Flow

1. Inspect staged scope with compact git commands.
2. Refresh project memory with `node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id <PROJECT_ID>` when available.
3. If Codex Memory MCP fails with `Transport closed`, treat it as `mcp_transport_failed -> direct_fallback`; pass the MCP error and any failed `store_memory` payload to the helper.
4. Summarize created or updated MemoryGraph memories, fallback route, and promotion candidates in a short bullet list.
5. Keep `.claude/memory.json`, `.claude/memorygraph/`, and `.claude/cache/memorygraph/` unstaged unless the user explicitly asks to include memory artifacts.
6. Stage docs and code only.
7. Create a Korean one-line title plus bullet body commit.

## Compact Summary Format

```md
### Project Memory Update Complete

- Project: {PROJECT_ID}
- Memory route: mcp | direct_fallback | direct_failed
- Created memories: {count}
- Updated memories: {count}
- Relationships: {count}
- Boundary updates: {count}
- Memory log: .claude/logs/memorygraph/commit-refresh-*.json
```
