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

Durable source roadmaps that define harness direction or review contracts are tracked under `docs/public/roadmaps/`, including `docs/public/roadmaps/harness-control-plane-modernization/`. Runtime execution scratch under `docs/implementation/**` must remain untracked in this harness source repository. It is excluded from Git so GitHub-based skill installers can clone the repository reliably on Windows path-length-limited systems.

## GitHub Required Checks

Branch protection is a repository setting, not something this source package can apply by itself. Protect `main` with the following required checks:

- `CI / Node 20.x on ubuntu-latest`
- `CI / Node 20.x on windows-latest`
- `CI / Node 20.x on macos-latest`
- `CI / Node 22.x on ubuntu-latest`
- `CI / Node 22.x on windows-latest`
- `CI / Node 22.x on macos-latest`
- `CodeQL / Analyze JavaScript`
- `Dependency Review / Pull Request`

Require pull request review for changes under `scripts/`, `skills/`, `agents/`, `schemas/`, `package/`, `.github/`, and `docs/public/`. Do not allow direct pushes to `main` or bypasses for harness-critical roots.
Enable Dependabot alerts/security updates, secret scanning, and push protection in repository settings.

Track release gate status separately:

- `source-ci-ready`: tracked CI/security source exists, parses, and local dry-runs pass.
- `github-settings-applied`: branch protection, CODEOWNERS review, dependency review, secret scanning, and push protection are applied in GitHub UI/API with evidence.
- `release-protected`: source checks pass and GitHub settings evidence is attached.

Source files alone can only close `source-ci-ready`.
Do not claim `release-protected` from `.github/` files without GitHub settings/API evidence.

## Expected Dry-Run Signal

The default dry run should show `mode: account-root-direct` and target `~/.moonshot-relay`, `~/.claude`, and `~/.codex`. A project dry run should show that the installer would create or update the downstream `.claude/` profile while preserving protected project-local files such as `PROJECT.md`, local settings, custom files, and environment files.

## Rollout Smoke Levels

Keep rollout evidence separated by target:

- `source-smoke`: run from the checkout with source `scripts/runtime-state.mjs`.
- `package-smoke`: run from materialized `package/moonshot-relay/profile/scripts/runtime-state.mjs`.
- `temp-home-smoke`: install into explicit temp `--moonshot-home`, `--claude-home`, and `--codex-home` targets, then run the installed `runtime-state.mjs`.
- `live-account-root-smoke`: run only after explicit adoption approval and state preservation evidence.

`source-smoke`, `package-smoke`, and `temp-home-smoke` can close package readiness.
They cannot prove live adoption.
Live account-root adoption is a separate controlled step.

## State Preservation

The account-root installer must preserve:

- `${MOONSHOT_RELAY_HOME}/state/**`
- Claude protected profile state such as `settings.json`, `memory.json`, `sessions/`, `cache/`, `plugins/`, `projects/`, and telemetry state
- Codex protected profile state such as `auth.json`, `config.toml`, `sessions/`, `cache/`, `plugins/`, `memories/`, and sqlite state
- unrelated user-installed skills and agents

Package payloads must continue excluding generated DB/WAL/SHM files, verdict JSON, traces, logs, caches, browser artifacts, memorygraph DBs, and profile-local state.

## Rollback Checklist

Before live adoption, capture:

- install command and `installId`
- dry-run JSON for all runtimes
- temp-home smoke JSON
- list of preserved state roots
- backup directory paths from the install manifest when backup is enabled
- command to restore from backup or rerun the previous released installer

If native dependency smoke returns `missing_native_module`, record it as `typed_degraded_authority_blocked`.
Do not count degraded native dependency evidence as runtime availability.
