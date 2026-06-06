# Global Guidelines

Last-Reviewed: 2026-04-09

`.claude/` is a development profile, not canonical source. Keep this Tier 1 file as a short TOC.

1. `AGENTS.md` and this file are TOCs.
2. Store durable policy in canonical source docs first; use `.claude/PROJECT.md`, `.claude/rules/`, and `docs/public/guidelines/` as active profile links.
3. Keep always-loaded context minimal and under budget.
4. Update canonical source docs first, then refresh TOC links.
5. Run the active knowledge repository audit after structural doc changes when that support entrypoint is installed.
6. Resolve shared runtime assets through `MOONSHOT_RELAY_HOME` (`%MOONSHOT_RELAY_HOME%` in cmd.exe, `$env:MOONSHOT_RELAY_HOME` in PowerShell, `${MOONSHOT_RELAY_HOME}` in bash/zsh; default `~/.moonshot-relay`).
7. Runtime contract: `.claude/CLAUDE.md` + `.claude/verification.contract.yaml`.
8. Generated state, logs, caches, traces, browser artifacts, sqlite state, memorygraph data, and verdict JSON are excluded from package payloads.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".moonshot-relay/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: "docs/public/guidelines"
```

## References

- `@.claude/CLAUDE.md`
- `@.claude/verification.contract.yaml`
- `@docs/public/guidelines/knowledge-repository-ops.md`
- `@docs/public/guidelines/provider-neutral-model-routing.md`
- `@docs/public/guidelines/resumable-session-layer.md`
- `@.claude/rules/agents/agent-definition.md`
