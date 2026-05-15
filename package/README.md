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

Runtime compatibility output remains under `.claude/` until the compatibility-wrapper phase removes or replaces it. Codex and Claude profile templates live under `package/profile-templates/`; generated profile payloads are written under `package/claude/profile/` and `package/codex/profile/` only when `package/build-package.mjs` runs.

The generated profile payloads must include concrete skills, agents, scripts, CLI entrypoints, runtime tools, schemas, templates, and docs copied or generated from the canonical roots. README-only payload directories are invalid, but generated payload directories themselves are not committed.

Build local payloads with:

```sh
node package/build-package.mjs --runtime all --clean
```

Generated state is never part of the package payload. Logs, caches, traces, browser artifacts, sqlite state, memorygraph data, temporary runtime directories, and verification verdict outputs must stay outside package assembly.
