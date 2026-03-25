# Global Development Guidelines

> Entry map for always-loaded instructions. Keep this file short.

Last-Reviewed: 2026-03-05

## Overview

Rules in `.claude/rules/` are always loaded recursively. This file holds Tier-1 constraints only.

## Tier-1 Constraints

1. `AGENTS.md` and this file are TOCs, not full policy dumps.
2. Store durable policy in source-of-truth docs:
   - `.claude/PROJECT.md` (project contract)
   - `.claude/rules/` (enforceable rules)
   - `.claude/docs/guidelines/` (operational procedures)
3. Keep always-loaded context minimal:
   - `.claude/rules/**/*.md` should stay within line/token budget
   - Keep only constraints AI cannot infer from code structure
4. Update source docs first, then refresh links in TOC docs.
5. Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc changes.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

For token and archive policy, see `.claude/docs/guidelines/document-memory-policy.md`.

## References

- Project contract: `@.claude/PROJECT.md`
- Knowledge repository ops: `@.claude/docs/guidelines/knowledge-repository-ops.md`
- Token optimization: `@.claude/docs/guidelines/token-optimization.md`
- Agent definition rule: `@.claude/rules/agents/agent-definition.md`
