# Repository Layout

This repository separates canonical source, development profiles, generated package payloads, and runtime state.

## Canonical Source

Add durable source files to the root-level source directories:

- `skills/` for skill definitions
- `agents/` for agent definitions
- `rules/` for workflow and policy rules
- `scripts/` for maintained scripts
- `schemas/` for machine-readable contracts
- `templates/` for reusable templates
- `tests/` for package and materialization checks
- `docs/public/` for contributor-facing documentation

Do not add new canonical source under `.claude/`. During the refactor, `.claude/` remains a compatibility and development profile boundary until later phases move existing material behind wrappers.

## Development Profile

`.claude/` and `.codex/` are runtime profile locations for local execution. They may contain compatibility wrappers, generated copies, repository-local configuration, or runtime-specific profile files. They are not the canonical source location for new skills, scripts, rules, schemas, or templates.

## Package Payload

`package/package-contract.yaml` declares what Claude and Codex package assembly must include. `package/claude/profile/`, `package/codex/profile/`, `.claude-plugin/`, and `.codex-plugin/` are generated or curated payload boundaries derived from canonical source and the package contract.

## Generated State

Generated state is excluded from package payloads. Logs, caches, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and verification verdict files must remain outside canonical source and package assembly.

## Contributor Rule

When adding a new skill or script, edit `skills/` or `scripts/` first. Runtime profile updates should be produced through package materialization or compatibility wrappers, not by manually maintaining a second long-lived source copy under `.claude/`.
