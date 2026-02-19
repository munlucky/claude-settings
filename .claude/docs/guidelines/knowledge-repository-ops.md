---
title: Knowledge Repository Operations
description: Operating model for TOC vs source-of-truth docs, freshness control, and machine checks
applies-to:
  - moonshot-orchestrator
  - pre-flight-check
  - doc-auto-sync
lastReviewed: 2026-02-19
---

# Knowledge Repository Operations

## 1. Purpose

Keep agent knowledge usable at runtime by separating:

- Entry map (fast discovery)
- Source of truth (durable policy/procedure)
- Mechanical checks (freshness/link integrity)

## 2. Operating Model

### 2.1 Entry map (TOC only)

- `AGENTS.md` and `.claude/CLAUDE.md` must stay short.
- They link to source-of-truth docs, not duplicate full policies.

### 2.2 Source of truth

- `.claude/PROJECT.md`: project contract and runtime assumptions
- `.claude/rules/`: enforceable base rules
- `.claude/docs/guidelines/`: operational procedures
- `{tasksRoot}` (from PROJECT): task-scoped working memory

## 3. Directory Contract

### Template repository (this repo)

- Core docs live under `.claude/`
- Task memory default: `.claude/docs/tasks`

### Installed target project

- Prefer git-tracked docs:
  - `documentPaths.tasksRoot: docs/claude-tasks`
  - `documentPaths.guidelinesRoot: docs/guidelines`
- Keep `.claude/` for reusable rules/skills/scripts

## 4. Change Workflow

1. Update source-of-truth doc first.
2. Add or refresh links in `AGENTS.md` / `.claude/CLAUDE.md`.
3. Set or update `Last-Reviewed: YYYY-MM-DD` on map/contract docs.
4. Run `.claude/scripts/knowledge-repo-audit.sh`.

## 5. Freshness Policy

- Core map/contract docs: review every 45 days.
- Operational guides: review every 90 days.
- Broken local links are blocking issues.
- Missing review date is a warning until backfilled.

## 6. Audit Command

```bash
.claude/scripts/knowledge-repo-audit.sh
```

Output:

- Console summary
- JSON artifact: `.claude/knowledge-repo-audit-<runId>.json`

