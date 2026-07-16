# Package Boundary

`package/` describes runtime payload contracts and the materializer that assembles them from canonical source directories.

Canonical source belongs in root-level directories:

- `skills/`
- `agents/`
- `rules/`
- `scripts/` for maintained installer, MCP, memory, and closeout support scripts
- `archive/scripts/legacy-phase-adapters/` for preserved legacy phase adapters that are not installed
- `bin/`
- `tools/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

Root `.claude/`, `.codex/`, `.qwen/`, and `.gemini/antigravity/` are local runtime profiles only and are not committed to the repository. Claude, Codex, Qwen, and Antigravity profile templates live under `package/profile-templates/`; generated profile payloads are written under `package/claude/profile/`, `package/codex/profile/`, `package/qwen/profile/`, and `package/antigravity/profile/` only when `package/build-package.mjs` runs. Antigravity public skills are projected to `.gemini/config/skills/` by the account-root installer for IDE discovery.

The generated profile payloads must include concrete skills, agents, CLI entrypoints, runtime tools, schemas, templates, docs, and only the allowlisted support scripts needed for installer, MCP, memory, and closeout flows. Runtime workflow scripts are not copied wholesale into the package payload. README-only payload directories are invalid, but generated payload directories themselves are not committed.

Legacy delegated-terminal phase adapters and their tests are archived under `archive/scripts/legacy-phase-adapters/`. They remain available for explicit compatibility investigation, but package materialization must not copy the archive into runtime profiles.

Build local payloads with:

```sh
node package/build-package.mjs --runtime all --clean
```

Install the account-root runtime profiles directly into the local Claude/Codex/Qwen/Antigravity homes with either the default shell installer or the direct Node installer:

```sh
bash install-claude.sh
node scripts/install-account-root-harness.mjs --runtime all --remove-legacy-harness-core
npx -y github:munlucky/moonshot-relay install
```

This installs shared Moonshot Relay runtime assets into `MOONSHOT_RELAY_HOME`, defaulting to `~/.moonshot-relay`, then installs only runtime-discovered exposure entries into `%USERPROFILE%/.claude`, `%USERPROFILE%/.codex`, `%USERPROFILE%/.qwen`, and `%USERPROFILE%/.gemini/antigravity` on Windows or the corresponding account roots on macOS/Linux without using a nested `harness-core` directory. Antigravity public skills are additionally projected into `%USERPROFILE%/.gemini/config/skills` or `${ANTIGRAVITY_SKILLS_HOME}/skills` for IDE discovery. Use `%MOONSHOT_RELAY_HOME%` in `cmd.exe`, `$env:MOONSHOT_RELAY_HOME` in PowerShell, and `${MOONSHOT_RELAY_HOME}` in bash/zsh. The common payload preserves canonical `skills/**`, and the runtime `skills/` discovery surface is limited by `package/runtime-surface.json` to `product-orchestrator`, `moonshot-architecture`, `moonshot-orchestrator`, `moonshot-phase-runner`, `moonshot-plan-writer`, `commit-moonshot`, `session-logger`, and `explain-diff-html`. Runtime-local files such as Claude settings, Codex auth/config, Qwen settings, sessions, caches, plugins, memories, and sqlite state are protected by default. Each managed target root receives a hash manifest for verification and rollback evidence. Existing `.claude-settings-install-manifest.json` files are treated as legacy install evidence during the rename window.

Use `bash install-claude.sh --project` only when a downstream repository needs project-local `.claude/` and `.codex/` compatibility payloads. Qwen support is account-root profile installation through the Node installer.

Bootstrap from Agent Skills CLI with:

```sh
npx skills add munlucky/moonshot-relay
```

This installs the repository root `skills/*/SKILL.md` entries, including `moonshot-relay-setup`. Invoke that setup skill to run the account-root installer and complete the full runtime profile installation. The `npx skills add` command itself does not run repository installers; use `npx -y github:munlucky/moonshot-relay install` when `npx` must produce the same account-root result as the setup script.

Generated state is never part of the package payload. Runtime payload also excludes dev-only diagnostics and obsolete workflow scripts. Logs, caches, traces, browser artifacts, sqlite state, memorygraph data, temporary runtime directories, and verification verdict outputs must stay outside package assembly.
