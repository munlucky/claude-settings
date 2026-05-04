---
name: harness-memory-promoter
description: Promote approved reusable project knowledge into the claude-settings harness MemoryGraph.
triggers:
  - "promote harness memory"
  - "promote memory candidates"
  - "harness memory promotion"
---

# Harness Memory Promoter

Use this skill when the user explicitly approves promotion of reusable project knowledge into the harness graph.

## Required Flow

1. Run from the `claude-settings` repository root.
2. Read the source project's `.claude/cache/memorygraph/promotion-candidates.json`.
3. Filter out project-specific domain facts, one-off details, secrets, and `.claude/docs/ko/` derived facts.
4. Invoke `harness-memory-promoter` with `approval: approved`.
5. Store accepted items with:
   - `project:claude-settings`
   - `source:moonshot`
   - `promoted`
   - `from-project:{sourceProjectId}`

## Hard Rules

- Never write directly from the source project into the harness graph.
- Never promote raw project graph dumps.
- Keep promoted memories compact and reusable.
- If MemoryGraph is unavailable, report the failure and do not block unrelated work.
