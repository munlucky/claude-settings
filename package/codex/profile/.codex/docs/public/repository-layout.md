# Repository Layout

This repository separates canonical source, development profiles, generated package payloads, compatibility wrappers, and runtime state.

## Canonical Source

Durable source files live in the root-level source directories:

- `skills/` for skill definitions
- `agents/` for agent definitions
- `rules/` for workflow and policy rules
- `scripts/` for maintained scripts
- `bin/` for CLI entrypoints
- `tools/` for runtime tooling source
- `schemas/` for machine-readable contracts
- `templates/` for reusable templates
- `tests/` for package and materialization checks
- `tests/fixtures/` for deterministic regression inputs
- `docs/public/` for contributor-facing documentation

Do not add new canonical source under `.claude/`. During the compatibility window, `.claude/` remains a development profile and installed-runtime compatibility boundary. References to `.claude/...` are valid when they describe installed payloads, runtime wrapper entrypoints, active profile contracts, or legacy generated-state cleanup. They are not valid when they tell contributors to edit `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` as the durable source of truth.

## Development Profile

`.claude/` and `.codex/` are runtime profile locations for local execution. They may contain compatibility wrappers, generated copies, repository-local configuration, or runtime-specific profile files. They are not the canonical source location for new skills, scripts, CLI entrypoints, tools, rules, schemas, or templates.

The root-level canonical directories must contain real harness files, not README-only placeholders. `tests/package-layout.test.mjs` guards that requirement so an empty scaffold cannot pass as the refactored repository shape.

The active repository profile still reads `.claude/CLAUDE.md`, `.claude/verification.contract.yaml`, and selected `.claude/rules/**` files so existing agents can run during migration. Keep those files short and link back to canonical docs or root source directories when durable policy changes.

## Package Payload

`package/package-contract.yaml` declares what Claude and Codex package assembly must include. `package/claude/profile/`, `package/codex/profile/`, `.claude-plugin/`, and `.codex-plugin/` are generated or curated payload boundaries derived from canonical source and the package contract.

Downstream installs continue to materialize `.claude/` payloads until a later major version. That compatibility behavior is intentional and should be verified with `bash install-claude.sh --dry-run` after changes that affect package layout, installer behavior, or public docs.

## Generated State

Generated state is excluded from package payloads. Logs, caches, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and verification verdict files must remain outside canonical source and package assembly. Regression fixtures are source-owned test inputs under `tests/fixtures/`, not runtime payload.

## Contributor Rule

When adding a new skill, agent, rule, script, CLI entrypoint, runtime tool, schema, template, or test:

1. Edit the matching canonical root directory first, such as `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, or `tests/`.
2. Update public docs in `docs/public/` when the contributor workflow or installed behavior changes.
3. Regenerate or refresh profile/package output through the materialization path declared by `package/package-contract.yaml`.
4. Keep `.claude/...` changes limited to active profile contracts, compatibility wrappers, or documented installed-runtime payloads.

Do not manually maintain duplicate source directories under `.claude/`; duplicate runtime output must be reproducible from canonical source or explicitly documented as a temporary compatibility wrapper.
