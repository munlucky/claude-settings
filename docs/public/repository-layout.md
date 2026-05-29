# Repository Layout

This repository separates canonical source, local runtime profiles, generated package payloads, compatibility wrappers, and runtime state.

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

Do not add new canonical source under root `.claude/` or `.codex/`. Those directories are local runtime profiles and must not be tracked by Git. References to `.claude/...` are valid when they describe installed payloads, local runtime wrapper entrypoints, active local profile contracts, or legacy generated-state cleanup. They are not valid when they tell contributors to edit `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` as the durable source of truth.

## Local Runtime Profile

Root `.claude/` and `.codex/` are runtime profile locations for local execution only. They may contain compatibility wrappers, generated copies, repository-local configuration, or runtime-specific profile files, but remote repositories must not contain them. They are not the canonical source location for new skills, scripts, CLI entrypoints, tools, rules, schemas, templates, verification contracts, or project knowledge state.

The root-level canonical directories must contain real harness files, not README-only placeholders. `tests/package-layout.test.mjs` guards that requirement so an empty scaffold cannot pass as the refactored repository shape.

Local agents may still read `.claude/CLAUDE.md`, `.claude/verification.contract.yaml`, and selected `.claude/rules/**` files after installation or materialization. Treat those files as local runtime output derived from canonical docs, schemas, or root source directories.

## Package Payload

`package/package-contract.yaml` declares what Claude and Codex package assembly must include. `package/profile-templates/`, `package/build-package.mjs`, `.claude-plugin/`, and `.codex-plugin/` are the committed package boundary. `package/claude/profile/` and `package/codex/profile/` are ignored generated payload roots derived from canonical source and the package contract.

Downstream installs continue to materialize local `.claude/` payloads. That compatibility behavior is intentional and should be verified with `bash install-claude.sh --dry-run` or `node scripts/install-account-root-harness.mjs --runtime all --dry-run` after changes that affect package layout, installer behavior, or public docs.

Account-root installs use `scripts/install-account-root-harness.mjs` and write harness-owned payloads directly into `%USERPROFILE%/.claude` and `%USERPROFILE%/.codex`. They do not create or depend on nested `harness-core` directories. Runtime-local files such as settings, auth, sessions, caches, plugins, memories, sqlite databases, project knowledge state, execution evidence, phase status, logs, and verification verdicts remain outside the installed harness payload.

## Generated State

Generated state is excluded from package payloads. Logs, caches, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and verification verdict files must remain outside canonical source and package assembly. Regression fixtures are source-owned test inputs under `tests/fixtures/`, not runtime payload.

## Contributor Rule

When adding a new skill, agent, rule, script, CLI entrypoint, runtime tool, schema, template, or test:

1. Edit the matching canonical root directory first, such as `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, or `tests/`.
2. Update public docs in `docs/public/` when the contributor workflow or installed behavior changes.
3. Regenerate or refresh profile/package output through the materialization path declared by `package/package-contract.yaml`.
4. Keep root `.claude/` and `.codex/` local-only; regenerate them from canonical source instead of committing them.

Do not manually maintain duplicate source directories under root `.claude/` or `.codex/`; duplicate runtime output must be reproducible from canonical source or explicitly documented as a temporary compatibility wrapper.
