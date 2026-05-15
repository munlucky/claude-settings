# Installer Usage

`install-claude.sh` installs runtime profiles into downstream projects. During the compatibility window, Claude users continue to receive `.claude/` payloads even though canonical source in this repository lives in root-level source directories.

## Compatibility Window

The installer keeps `.claude/` output stable until a later major version removes or replaces legacy entrypoints. This means downstream docs, skills, and scripts that invoke `.claude/scripts/...` remain valid when they refer to installed runtime payloads or compatibility wrappers.

The installer must not treat `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/schemas`, or `.claude/templates` in this repository as canonical source. Durable edits start in `skills/`, `agents/`, `rules/`, `scripts/`, `schemas/`, `templates/`, `tests/`, or `docs/public/`.

## Contributor Flow

For a source change:

1. Edit the canonical root directory first.
2. Update public docs if installed behavior changes.
3. Run the package and migration checks from the active phase contract.
4. Use `bash install-claude.sh --dry-run` to confirm downstream `.claude/` output is still materialized.

Do not edit generated package payloads or runtime state to make a test pass. Generated state includes logs, caches, traces, browser artifacts, sqlite files, memorygraph data, and verification verdict JSON.

## Expected Dry-Run Signal

The dry run should show that the installer would create or update the downstream `.claude/` profile while preserving protected project-local files such as `PROJECT.md`, local settings, custom files, and environment files.
