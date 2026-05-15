# Package Boundary

`package/` describes generated or curated runtime payloads assembled from canonical source directories.

Canonical source belongs in root-level directories:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

Runtime compatibility output remains under `.claude/` until the compatibility-wrapper phase removes or replaces it. Codex and Claude profile payloads are declared here so installers can materialize runtime-specific layouts without treating `.claude/` as source.

Generated state is never part of the package payload. Logs, caches, traces, browser artifacts, sqlite state, memorygraph data, temporary runtime directories, and verification verdict outputs must stay outside package assembly.
