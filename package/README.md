# Package Boundary

`package/` describes runtime payload contracts and the materializer that assembles them from canonical source directories.

Canonical source belongs in root-level directories:

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

Root `.claude/` and `.codex/` are local runtime profiles only and are not committed to the repository. Codex and Claude profile templates live under `package/profile-templates/`; generated profile payloads are written under `package/claude/profile/` and `package/codex/profile/` only when `package/build-package.mjs` runs.

The generated profile payloads must include concrete skills, agents, scripts, CLI entrypoints, runtime tools, schemas, templates, and docs copied or generated from the canonical roots. README-only payload directories are invalid, but generated payload directories themselves are not committed.

Build local payloads with:

```sh
node package/build-package.mjs --runtime all --clean
```

Install the account-root runtime profiles directly into the local Claude/Codex homes with:

```sh
node scripts/install-account-root-harness.mjs --runtime all --remove-legacy-harness-core
```

This installs harness-owned payloads into `%USERPROFILE%/.claude` and `%USERPROFILE%/.codex` without using a nested `harness-core` directory. Runtime-local files such as Claude settings, Codex auth/config, sessions, caches, plugins, memories, and sqlite state are protected by default. Each target root receives `.moonshot-relay-install-manifest.json` for hash verification and rollback evidence. Existing `.claude-settings-install-manifest.json` files are treated as legacy install evidence during the rename window.

Generated state is never part of the package payload. Logs, caches, traces, browser artifacts, sqlite state, memorygraph data, temporary runtime directories, and verification verdict outputs must stay outside package assembly.
