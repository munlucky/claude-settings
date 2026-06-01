# Repository Layout

This repository separates canonical source, local runtime profiles, generated package payloads, compatibility wrappers, and runtime state.

## Canonical Source

Durable source files live in the root-level source directories:

- `skills/` for skill definitions
- `agents/` for agent definitions
- `rules/` for workflow and policy rules
- `scripts/` for maintained installer, MCP, memory, and closeout support scripts
- `archive/scripts/legacy-phase-adapters/` for preserved delegated-terminal adapters, diagnostics, and script-local tests that are no longer installed
- `bin/` for CLI entrypoints
- `tools/` for runtime tooling source
- `schemas/` for machine-readable contracts
- `templates/` for reusable templates
- `tests/` for package and materialization checks
- `tests/fixtures/` for deterministic regression inputs
- `docs/public/` for contributor-facing documentation

Do not add new canonical source under root `.claude/` or `.codex/`. Those directories are local runtime profiles and must not be tracked by Git. References to `.claude/...` are valid when they describe installed payloads, local runtime wrapper entrypoints, active local profile contracts, or legacy generated-state cleanup. They are not valid when they tell contributors to edit `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` as the durable source of truth.

## Local Runtime Profile

Root `.claude/` and `.codex/` are runtime profile locations for local execution only. They may contain compatibility wrappers, generated copies, repository-local configuration, or runtime-specific profile files, but remote repositories must not contain them. They are not the canonical source location for new skills, support scripts, CLI entrypoints, tools, rules, schemas, templates, verification contracts, or project knowledge state.

The root-level canonical directories must contain real harness files, not README-only placeholders. `tests/package-layout.test.mjs` guards that requirement so an empty scaffold cannot pass as the refactored repository shape.

Local agents may still read `.claude/CLAUDE.md`, `.claude/verification.contract.yaml`, and selected `.claude/rules/**` files after installation or materialization. Treat those files as local runtime output derived from canonical docs, schemas, or root source directories.

## Package Payload

`package/package-contract.yaml` declares what Claude and Codex package assembly must include. `package/profile-templates/`, `package/build-package.mjs`, `.claude-plugin/`, and `.codex-plugin/` are the committed package boundary. `package/claude/profile/` and `package/codex/profile/` are ignored generated payload roots derived from canonical source and the package contract.

Default installs materialize shared Moonshot Relay runtime assets under `.moonshot-relay/` and only runtime-discovered exposure entries under `.claude/` and `.codex/`. Claude keeps `.claude/rules/`, `.claude/skills/`, and `.claude/agents/` because those are active profile surfaces. Project-local installs continue to materialize local `.claude/` payloads only when `install-claude.sh --project` is used. Workflow orchestration no longer receives `scripts/**` wholesale. This compatibility behavior is intentional and should be verified with `bash install-claude.sh --dry-run`, `bash install-claude.sh --project --dry-run`, or `node scripts/install-account-root-harness.mjs --runtime all --dry-run` after changes that affect package layout, installer behavior, or public docs.

Account-root installs use `scripts/install-account-root-harness.mjs` and write common harness-owned payloads into `%USERPROFILE%/.moonshot-relay`, with thin Claude/Codex exposure layers in `%USERPROFILE%/.claude` and `%USERPROFILE%/.codex`. They do not create or depend on nested `harness-core` directories. Runtime-local files such as settings, auth, sessions, caches, plugins, memories, sqlite databases, project knowledge state, execution evidence, phase status, logs, and verification verdicts remain outside the installed harness payload.

## Generated State

Generated state is excluded from package payloads. Logs, caches, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and verification verdict files must remain outside canonical source and package assembly. Regression fixtures are source-owned test inputs under `tests/fixtures/`, not runtime payload.

## Contributor Rule

When adding a new skill, agent, rule, support script, CLI entrypoint, runtime tool, schema, template, or test:

1. Edit the matching canonical root directory first, such as `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, or `tests/`.
2. Update public docs in `docs/public/` when the contributor workflow or installed behavior changes.
3. Regenerate or refresh profile/package output through the materialization path declared by `package/package-contract.yaml`.
4. Keep root `.claude/` and `.codex/` local-only; regenerate them from canonical source instead of committing them.

Do not manually maintain duplicate source directories under root `.claude/` or `.codex/`; duplicate runtime output must be reproducible from canonical source or explicitly documented as a temporary compatibility wrapper.
