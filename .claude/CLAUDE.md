# Global Guidelines

Last-Reviewed: 2026-04-09

`.claude/` is a development profile, not canonical source. Keep this Tier 1 file as a short TOC.

1. `AGENTS.md` and this file are TOCs.
2. Store durable policy in canonical source docs first; use `.claude/PROJECT.md`, `.claude/rules/`, and `.claude/docs/guidelines/` as active profile links.
3. Keep always-loaded context minimal and under budget.
4. Update canonical source docs first, then refresh TOC links.
5. Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc changes.
6. Runtime contract: `.claude/CLAUDE.md` + `.claude/verification.contract.yaml`.
7. Generated state, logs, caches, traces, browser artifacts, sqlite state, memorygraph data, and verdict JSON are excluded from package payloads.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

## References

- `@.claude/CLAUDE.md`
- `@.claude/verification.contract.yaml`
- `@.claude/docs/guidelines/knowledge-repository-ops.md`
- `@.claude/docs/guidelines/provider-neutral-model-routing.md`
- `@.claude/docs/guidelines/resumable-session-layer.md`
- `@.claude/rules/agents/agent-definition.md`
