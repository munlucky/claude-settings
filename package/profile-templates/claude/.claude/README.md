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

The `.claude/skills`, `.claude/agents`, and `.claude/rules` trees are service-profile exposure for Claude. Common harness scripts, CLI entrypoints, runtime tools, schemas, templates, and public docs are installed under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`. When editing durable skills, agents, rules, scripts, schemas, templates, or tests, update the canonical root first and materialize profile output from that source.

Verification entrypoints may remain under `.claude/agents/verification/...` as Claude service agents. Do not add duplicate common harness trees under the Claude profile; scripts, CLI entrypoints, runtime tools, schemas, templates, and public docs belong under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`.

## Always-Loaded Profile

- `.claude/CLAUDE.md` stays a short TOC for active runtime instructions.
- `.claude/PROJECT.md` stores repository-local development policy.
- `.claude/skills/**`, `.claude/agents/**`, and `.claude/rules/**` expose Claude service behavior.
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
