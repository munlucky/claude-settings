# `.claude` Development Profile

`.claude/` is this repository's local Claude development profile. It is kept for active agent usability and installed-runtime compatibility, not as the canonical source for reusable workflow assets.

## Source Boundaries

Canonical source belongs in the root-level directories declared by `package/package-contract.yaml`:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `bin/`
- `tools/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

The root-level source directories are populated with the real harness files. The `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, and `.claude/templates` trees are local profile copies or compatibility material during the migration window. When editing durable skills, agents, scripts, CLI entrypoints, runtime tools, schemas, templates, or tests, update the canonical root first and materialize or wrap profile output from that source.

Compatibility wrappers may remain under `.claude/scripts/...` and `.claude/agents/verification/...` until a later major version removes or replaces legacy entrypoints. Those wrappers must point to a canonical root script, a documented installed runtime path, or a generated package profile path. Do not add undocumented duplicate source trees under `.claude/`.

## Always-Loaded Profile

- `.claude/CLAUDE.md` stays a short TOC for active runtime instructions.
- `.claude/PROJECT.md` stores repository-local development policy.
- `.claude/rules/**` may hold local runtime copies or compatibility policy while active Claude sessions still load `.claude`.
- `.claude/verification.contract.yaml` remains the active verification contract path during migration.
- `.claude/profile-contract.yaml` records the dev-profile validation boundary.

## Generated State

Generated state is not source and is never part of package payloads. Excluded state includes logs, cache, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and transient verification verdict JSON.

Use `tests/package-materialization.test.mjs` to verify the development profile boundary and generated state exclusions.

## Contributor Workflow

To add or modify a reusable asset, edit the matching canonical root directory first:

- `skills/` for skill definitions
- `agents/` for agent definitions
- `rules/` for workflow policy
- `scripts/` for maintained scripts
- `bin/` for CLI entrypoints
- `tools/` for runtime tooling source
- `schemas/` for contracts
- `templates/` for reusable templates
- `tests/` for verification
- `docs/public/` for contributor-facing docs

Refresh generated/profile output only through the package materialization flow or explicit compatibility wrappers. Do not treat `.claude` as the place where new harness source is authored.
