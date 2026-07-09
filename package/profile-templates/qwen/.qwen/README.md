# `.qwen` Runtime Profile

`.qwen/` is this repository's Qwen Code runtime profile template. It is a generated service-profile exposure layer, not the canonical source for reusable workflow assets.

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

The `.qwen/skills`, `.qwen/agents`, and `.qwen/rules` trees are Qwen Code service-profile exposure. Common harness scripts, schemas, templates, CLI entrypoints, runtime tools, and public docs are installed under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`. Claude `.claude/skills`, Codex `.codex/skills`, and Qwen `.qwen/skills` are service-profile exposure, not durable source. When editing durable skills, agents, rules, scripts, schemas, templates, or tests, update the canonical root first and materialize profile output from that source.

## Always-Loaded Profile

- `.qwen/QWEN.md` stays a short TOC for active Qwen Code runtime instructions.
- `.qwen/skills/**`, `.qwen/agents/**`, and `.qwen/rules/**` expose Qwen Code service behavior.
- `.qwen/verification.contract.yaml` remains the Qwen profile verification contract path during migration.

## Generated State

Generated state is not source and is never part of package payloads. Excluded state includes logs, cache, traces, browser artifacts, browser runtime materialization, sqlite runtime state, memorygraph data, temporary directories, audit outputs, and transient verification verdict JSON.

Use `tests/package-materialization.test.mjs` to verify the runtime profile boundary and generated state exclusions.
