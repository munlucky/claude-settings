# Moonshot Relay Agent TOC

Last-Reviewed: 2026-06-06

This repository's canonical source is the tracked root-level harness source, not the local `.claude/` or `.codex/` runtime profiles.

## Source Boundaries

- Canonical source: `skills/`, `agents/`, `rules/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `docs/public/`, and allowlisted support scripts under `scripts/`.
- Local runtime profiles: root `.claude/` and `.codex/`. These may contain generated verdicts, local profile output, or installed compatibility files and are not required for a clean source checkout.
- Shared runtime home: resolve through `MOONSHOT_RELAY_HOME`; default `~/.moonshot-relay`.

## Runtime Contract

- Installed Claude profile entrypoint: `.claude/CLAUDE.md`.
- Installed Codex profile entrypoint: `.codex/AGENTS.md`.
- Source checkout entrypoint: this file.
- Verification contract source: `schemas/verification.contract.yaml`, materialized to profile `verification.contract.yaml`.

## Default Document Paths

```yaml
documentPaths:
  tasksRoot: ".moonshot-relay/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: "docs/public/guidelines"
```

## References

- `README.md`
- `docs/public/repository-layout.md`
- `docs/public/installer-usage.md`
- `docs/public/guidelines/knowledge-repository-ops.md`
- `docs/public/guidelines/provider-neutral-model-routing.md`
- `docs/public/guidelines/resumable-session-layer.md`
- `rules/agents/agent-definition.md`
