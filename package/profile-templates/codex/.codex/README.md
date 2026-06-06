# `.codex` Development Profile

`.codex/` is this repository's local Codex development profile. It is kept for active agent usability during the repository layout migration, not as the canonical source for reusable workflow assets.

## Source Boundaries

Canonical source belongs in the root-level directories declared by `package/package-contract.yaml`:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

The `.codex/skills` and `.codex/agents` trees are local generated-profile material during the migration window. Claude `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/schemas`, and `.claude/templates` trees are compatibility or generated-profile material, not Codex source. When editing durable skills, agents, scripts, schemas, templates, or tests, update the canonical root first and materialize or wrap profile output from that source.

## Always-Loaded Profile

- `.codex/AGENTS.md` stays a short TOC for active Codex runtime instructions.
- `.codex/config.toml` stores Codex runtime integration examples.
- `.codex/verification.contract.yaml` remains the Codex profile verification contract path during migration.

## Generated State

Generated state is not source and is never part of package payloads. Excluded state includes logs, cache, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and transient verification verdict JSON.

Use `tests/package-materialization.test.mjs` to verify the development profile boundary and generated state exclusions.
