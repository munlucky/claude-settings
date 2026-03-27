# Global Development Guidelines

> TOC for always-loaded instructions. Keep it short.

Last-Reviewed: 2026-03-26

## Overview

`.claude/rules/` loads recursively. This file is Tier 1 only.

## Tier-1 Constraints

1. `AGENTS.md` and this file are TOCs.
2. Store durable policy in source-of-truth docs:
   - `.claude/PROJECT.md`
   - `.claude/rules/`
   - `.claude/docs/guidelines/`
3. Keep always-loaded context minimal:
   - `.claude/rules/**/*.md` must stay within budget
   - Keep only constraints AI cannot infer from code
4. Update source docs first, then refresh links in TOC docs.
5. Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc changes.
6. At runtime, use the active workspace `PROJECT.md` and `.claude/verification.contract.yaml`.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

For token/archive policy, see `document-memory-policy.md`.

## References

- `@.claude/PROJECT.md`
- `@.claude/verification.contract.yaml`
- `@.claude/docs/guidelines/knowledge-repository-ops.md`
- `@.claude/rules/agents/agent-definition.md`
