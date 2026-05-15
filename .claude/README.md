# `.claude` Development Profile

`.claude/` is this repository's local Claude development profile. It is kept for active agent usability during the repository layout migration, not as the canonical source for reusable workflow assets.

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

The `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/schemas`, and `.claude/templates` trees are compatibility or generated-profile material during the migration window. When editing durable skills, agents, scripts, schemas, templates, or tests, update the canonical root first and materialize or wrap profile output from that source.

## Always-Loaded Profile

- `.claude/CLAUDE.md` stays a short TOC for active runtime instructions.
- `.claude/PROJECT.md` stores repository-local development policy.
- `.claude/rules/**` may hold minimal runtime imports or compatibility policy until the canonical rules move is complete.
- `.claude/verification.contract.yaml` remains the active verification contract path during migration.
- `.claude/profile-contract.yaml` records the dev-profile validation boundary.

## Generated State

Generated state is not source and is never part of package payloads. Excluded state includes logs, cache, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and transient verification verdict JSON.

Use `tests/package-materialization.test.mjs` to verify the development profile boundary and generated state exclusions.
