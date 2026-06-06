# Moonshot Relay Claude Profile TOC

Last-Reviewed: 2026-06-06

`.claude/` is a service runtime profile, not canonical source. Keep this Tier 1 file as a short TOC.

1. `CLAUDE.md` is the Claude profile TOC.
2. Store durable policy in canonical source docs first; use profile-local `PROJECT.md` and `rules/` for Claude service behavior and `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines/` for public guidelines.
3. Keep always-loaded context minimal and under budget.
4. Update canonical source docs first, then refresh TOC links.
5. Run the active knowledge repository audit after structural doc changes when that support entrypoint is installed.
6. Resolve shared runtime assets through `MOONSHOT_RELAY_HOME` (`%MOONSHOT_RELAY_HOME%` in cmd.exe, `$env:MOONSHOT_RELAY_HOME` in PowerShell, `${MOONSHOT_RELAY_HOME}` in bash/zsh; default `~/.moonshot-relay`).
7. Runtime contract: `CLAUDE.md` + `verification.contract.yaml`.
8. Generated state, logs, caches, traces, browser artifacts, sqlite state, memorygraph data, and verdict JSON are excluded from package payloads.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".moonshot-relay/docs/tasks"
  agreementsRoot: ".moonshot-relay/docs/agreements"
  guidelinesRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines"
```

## References

- `@PROJECT.md`
- `@verification.contract.yaml`
- `@rules/agents/agent-definition.md`
- `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines/knowledge-repository-ops.md`
- `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines/provider-neutral-model-routing.md`
- `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines/resumable-session-layer.md`
