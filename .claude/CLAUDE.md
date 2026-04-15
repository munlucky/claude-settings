# Global Development Guidelines

> TOC for always-loaded instructions. Keep it short.

Last-Reviewed: 2026-04-09

## Overview

`.claude/rules/` loads recursively. This file is Tier 1 only.

## Tier-1 Constraints

1. `AGENTS.md` and this file are TOCs.
2. Store durable policy in source-of-truth docs:
   - `.claude/CLAUDE.md`
   - `.claude/PROJECT.md` (template for installed target projects)
   - `.claude/rules/`
   - `.claude/docs/guidelines/`
3. Keep always-loaded context minimal:
   - `.claude/rules/**/*.md` must stay within budget
   - Keep only non-inferable constraints
4. Update source docs first, then refresh links in TOC docs.
5. Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc changes.
6. At runtime, use `.claude/CLAUDE.md` and `.claude/verification.contract.yaml` as the workspace contract.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

For token/archive policy, see `document-memory-policy.md`.

## References

- `@.claude/CLAUDE.md`
- `@.claude/verification.contract.yaml`
- `@.claude/docs/guidelines/knowledge-repository-ops.md`
- `@.claude/docs/guidelines/resumable-session-layer.md`
- `@.claude/rules/agents/agent-definition.md`
