# Installer Usage

`install-claude.sh` installs Moonshot Relay runtime profiles. The default mode is account-root installation into the shared Moonshot Relay home (`~/.moonshot-relay`) plus the local Claude/Codex homes (`~/.claude`, `~/.codex`). Use `--project` only when a downstream repository needs project-local `.claude/` and `.codex/` compatibility payloads.

## Compatibility Window

The installer keeps runtime-discovered profile output stable for skills, agents, and Claude rules. Shared runtime assets such as tools, schemas, templates, docs, and support scripts live under `~/.moonshot-relay`. Workflow orchestration no longer installs `scripts/**` wholesale, so downstream docs or skills should not add new dependencies on `.claude/scripts/...` unless the file is explicitly listed in `package/package-contract.yaml`.

The installer must not treat `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` in this repository as canonical source. Durable edits start in `skills/`, `agents/`, `rules/`, the allowlisted support files under `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, or `docs/public/`.

Project-local installs are compatibility output. Run `bash install-claude.sh --project` to materialize them into the current repository. Without `--project`, `bash install-claude.sh` delegates to `scripts/install-account-root-harness.mjs`.

## Contributor Flow

For a source change:

1. Edit the canonical root directory first.
2. Update public docs if installed behavior changes.
3. Run the package and migration checks from the active phase contract.
4. Use `bash install-claude.sh --dry-run` to confirm account-root output, and `bash install-claude.sh --project --dry-run` when project-local compatibility output changes.

Do not edit generated package payloads or runtime state to make a test pass. Generated state includes logs, caches, traces, browser artifacts, sqlite files, memorygraph data, and verification verdict JSON.

## Expected Dry-Run Signal

The default dry run should show `mode: account-root-direct` and target `~/.moonshot-relay`, `~/.claude`, and `~/.codex`. A project dry run should show that the installer would create or update the downstream `.claude/` profile while preserving protected project-local files such as `PROJECT.md`, local settings, custom files, and environment files.
