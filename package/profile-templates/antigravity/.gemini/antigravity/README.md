# `.gemini/antigravity` Development Profile

`.gemini/antigravity/` is this repository's local Antigravity development profile. It is kept for active agent usability during the repository layout migration, not as the canonical source for reusable workflow assets.

## Source Boundaries

Canonical source belongs in the root-level directories declared by `package/package-contract.yaml`:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

The `.gemini/config/skills`, `.gemini/antigravity/agents`, and `.gemini/antigravity/rules` trees are Antigravity service-profile exposure. The legacy `.gemini/antigravity/skills` mirror is retained for compatibility while the global discovery path is active. Common harness scripts, schemas, templates, CLI entrypoints, runtime tools, and public docs are installed under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`. Claude `.claude/skills`, `.claude/agents`, and `.claude/rules` are Claude service-profile exposure, not Antigravity source. When editing durable skills, agents, rules, scripts, schemas, templates, or tests, update the canonical root first and materialize profile output from that source.

## Always-Loaded Profile

- `.gemini/antigravity/GEMINI.md` stays a short TOC for active Antigravity runtime instructions.
- `.gemini/config/skills/**`, `.gemini/antigravity/agents/**`, and `.gemini/antigravity/rules/**` expose Antigravity service behavior.
- `.gemini/antigravity/verification.contract.yaml` remains the Antigravity profile verification contract path during migration.

## Generated State

Generated state is not source and is never part of package payloads. Excluded state includes logs, cache, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and transient verification verdict JSON.

Use `tests/package-materialization.test.mjs` to verify the development profile boundary and generated state exclusions.
