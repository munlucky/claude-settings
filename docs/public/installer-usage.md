# Installer Usage

`install-claude.sh` is a macOS/Git Bash compatibility installer for Moonshot Relay runtime profiles. The primary cross-platform account-root installer is `node bin/moonshot-relay.mjs install --runtime all` or `npx -y github:munlucky/moonshot-relay install`. Use `--project` only when a downstream repository needs project-local `.claude/` and `.codex/` compatibility payloads.

The default mode is account-root installation into the shared Moonshot Relay home (`~/.moonshot-relay`) plus the local Claude/Codex homes (`~/.claude`, `~/.codex`).

Shared runtime references must resolve through `MOONSHOT_RELAY_HOME`. In `cmd.exe` this is `%MOONSHOT_RELAY_HOME%`, in PowerShell it is `$env:MOONSHOT_RELAY_HOME`, and in bash/zsh it is `${MOONSHOT_RELAY_HOME}`. If the variable is unset, installers and skills use the account default `~/.moonshot-relay`.

## Compatibility Window

The installer keeps runtime-discovered profile output stable for skills, agents, and Claude rules. Shared runtime assets such as tools, schemas, templates, docs, and support scripts live under `~/.moonshot-relay`. Workflow orchestration no longer installs `scripts/**` wholesale, so downstream docs or skills should depend on package-contract-listed support scripts rather than profile-local script paths.

The installer must not treat `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` in this repository as canonical source. Durable edits start in `skills/`, `agents/`, `rules/`, the allowlisted support files under `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, or `docs/public/`.

Project-local installs are compatibility output. Run `bash install-claude.sh --project` from supported macOS/Git Bash shells to materialize them into the current repository. In WSL/Linux bash environments where `install-claude.sh` reports `unsupported shell: Linux`, use `node bin/moonshot-relay.mjs install --runtime all` or `node scripts/install-account-root-harness.mjs --runtime all`.

GitHub-based `npx` can run the same account-root installer without a source checkout:

```sh
npx -y github:munlucky/moonshot-relay install
```

Agent Skills CLI bootstraps the root `skills/` catalog and installs the `moonshot-relay-setup` skill:

```sh
npx skills add munlucky/moonshot-relay
```

This command does not execute arbitrary repository installers. After it completes, invoke `moonshot-relay-setup` to run the account-root installer and materialize the full Claude/Codex profile under `~/.moonshot-relay`, `~/.claude`, and `~/.codex`. Use `node bin/moonshot-relay.mjs install --runtime all` when running directly from a source checkout, or `npx -y github:munlucky/moonshot-relay install` when the desired result is a one-command full account-root install. Use `bash install-claude.sh` only for the supported macOS/Git Bash compatibility path.

## Contributor Flow

For a source change:

1. Edit the canonical root directory first.
2. Update public docs if installed behavior changes.
3. Run the package and migration checks from the active phase contract.
4. Use `node bin/moonshot-relay.mjs install --dry-run --runtime all` to confirm account-root output. Use `bash install-claude.sh --project --dry-run` only from supported macOS/Git Bash shells when project-local compatibility output changes.

Do not edit generated package payloads or runtime state to make a test pass. Generated state includes logs, caches, traces, browser artifacts, sqlite files, memorygraph data, and verification verdict JSON.

Runtime plan and execution artifacts under `docs/implementation/**` must remain untracked in this harness source repository. They are excluded from Git so GitHub-based skill installers can clone the repository reliably on Windows path-length-limited systems.

## Expected Dry-Run Signal

The default dry run should show `mode: account-root-direct` and target `~/.moonshot-relay`, `~/.claude`, and `~/.codex`. A project dry run should show that the installer would create or update the downstream `.claude/` profile while preserving protected project-local files such as `PROJECT.md`, local settings, custom files, and environment files.
