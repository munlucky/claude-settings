# Global Guidelines

Last-Reviewed: 2026-04-09

`.claude/` is a development profile. Keep this Tier 1 file as a short TOC.

1. `AGENTS.md` and this file are TOCs.
2. Store durable policy in `.claude/PROJECT.md`, `.claude/rules/`, and `.claude/docs/guidelines/`.
3. Keep always-loaded context minimal and under budget.
4. Update source docs first, then refresh TOC links.
5. Run `.claude/scripts/knowledge-repo-audit.sh` after structural changes.
6. Runtime contract: `.claude/CLAUDE.md` + `.claude/verification.contract.yaml`.
7. Generated state, logs, caches, traces, browser artifacts, sqlite, memorygraph, and verdict JSON stay out of package payloads.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  guidelinesRoot: ".claude/docs/guidelines"
```

## References

- `@.claude/CLAUDE.md`
- `@.claude/verification.contract.yaml`
- `@.claude/docs/guidelines/knowledge-repository-ops.md`
- `@.claude/docs/guidelines/provider-neutral-model-routing.md`
- `@.claude/docs/guidelines/resumable-session-layer.md`
- `@.claude/rules/agents/agent-definition.md`
