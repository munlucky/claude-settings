---
title: Knowledge Repository Operations
description: Operating model for TOC vs source-of-truth docs, freshness control, and machine checks
applies-to:
  - moonshot-orchestrator
  - pre-flight-check
  - doc-auto-sync
lastReviewed: 2026-03-05
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

## 6. Always-Loaded Context Budget

- `.claude/rules/**/*.md` must stay under line budget (default: `250`).
- `.claude/CLAUDE.md` + rules combined must stay under total line budget (default: `320`).
- Always-loaded estimated token budget is enforced (default: `2200`, char-based estimate).
- Rule files should include constraints, not generic style examples.

## 7. PROJECT Placeholder Policy

- Template repositories may keep placeholders in `PROJECT.md` and `PROJECT.ko.md`.
- Enforce filled PROJECT files only when needed:
  - `KNOWLEDGE_REQUIRE_PROJECT_FILLED=true`
- When not enforced, placeholder hits are reported in metrics only.

## 8. Audit Command

```bash
.claude/scripts/knowledge-repo-audit.sh
```

Output:

- Console summary
- JSON artifact: `.claude/knowledge-repo-audit-<runId>.json`

Supported environment overrides:

- `KNOWLEDGE_REVIEW_MAX_DAYS`
- `KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX`
- `KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX`
- `KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX`
- `KNOWLEDGE_REQUIRE_PROJECT_FILLED`
- `HARNESS_KNOWLEDGE_AUDIT_FILE`
