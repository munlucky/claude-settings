# Phase 01 - Installed Runtime Path Contract v1

## Objective

Fix installed-runtime path breakage where active contracts and profile templates still call `.claude/scripts/*` even though account-root installation places shared support scripts under `MOONSHOT_RELAY_HOME`.

## Phase Execution Metadata

```yaml
phase: 01
dependsOn: []
ownedPaths:
  - schemas/verification.contract.yaml
  - package/profile-templates/codex/.codex/config.toml
  - package/profile-templates/claude/.claude/PROJECT.md
  - tests/package-layout.test.mjs
  - tests/package-materialization.test.mjs
  - package/build-package.mjs
readOnlyPaths:
  - scripts/install-account-root-harness.mjs
  - scripts/codex-mcp-singleton.mjs
  - scripts/memorygraph-mcp-wrapper.mjs
  - scripts/code-review-graph-mcp-wrapper.js
  - docs/public/installer-usage.md
liveMutationPolicy: no account-root profile mutation; use dry-run or generated package output only
```

## Issue A1 - verification.contract Active Commands

| Loop | Result |
|------|--------|
| Improvement v1 | Replace `node .claude/scripts/*` with `MOONSHOT_RELAY_HOME/scripts/*`. |
| Review 1 | Plain env substitution is shell-specific and can fail on Windows or TOML/YAML consumers. The allowlist also still permits `.claude/scripts`. |
| Improvement v2 | Introduce a runtime-home command template and require the resolver/materializer to render concrete installed paths. Keep archive commands only under explicit legacy commands. |
| Review 2 | Template-only change is insufficient unless package/materialization tests prove active contracts point at installed common payload support scripts. |
| Final v3 | Update active commands and `verificationOverrideAllowlist.allowedCommandPrefixes` away from `.claude/scripts`; add tests that materialized `verification.contract.yaml` has no active `.claude/scripts` commands and that legacy archive commands remain legacy-only. |

## Issue A2 - Codex MCP Config Runtime Path

| Loop | Result |
|------|--------|
| Improvement v1 | Replace `.claude/scripts/codex-mcp-singleton.mjs` and wrapper paths in `config.toml` with `MOONSHOT_RELAY_HOME/scripts`. |
| Review 1 | Codex TOML may not expand env vars, and account-root installer protects existing `~/.codex/config.toml`. |
| Improvement v2 | Render new template config against installed common root for generated/project install use. Preserve existing account-root config unless opt-in migration is requested. |
| Review 2 | New-user template and existing-user adoption must be separate; support scripts live in common payload, not Codex profile payload. |
| Final v3 | Ensure generated Codex config never references `.claude/scripts`; paths resolve to installed common root support scripts. Add tests for generated config and dry-run adoption boundary. |

## Issue A3 - Claude PROJECT Legacy Testing Rules

| Loop | Result |
|------|--------|
| Improvement v1 | Delete `.claude/scripts/*` testing commands from Claude `PROJECT.md`. |
| Review 1 | Deletion loses useful diagnostic guidance. Active runtime commands and legacy source-checkout diagnostics need separate labels. |
| Improvement v2 | Split Testing Rules into active installed runtime and explicit legacy compatibility investigation. |
| Review 2 | `PROJECT.md` is a Tier 1 profile contract; keep it short and link out for detail. |
| Final v3 | Remove active `bash/node/python .claude/scripts/*` rules, keep only `MOONSHOT_RELAY_HOME`/source-checkout commands in active guidance, and label archive commands as legacy-only with explicit reason. |

## Acceptance Criteria

- Active `schemas/verification.contract.yaml` commands and allowlists no longer contain `node .claude/scripts/`, `bash .claude/scripts/`, or `python .claude/scripts/`.
- Generated Codex `config.toml` has no `.claude/scripts` MCP command path.
- Claude profile `PROJECT.md` has no active testing rule that invokes `.claude/scripts`.
- Legacy archive commands are allowed only under explicit legacy sections.

## Verification

- `node --test tests/package-layout.test.mjs tests/package-materialization.test.mjs`
- `node package/build-package.mjs --runtime all --dry-run --json`
- Targeted scan: `rg -n "node \\.claude/scripts|bash \\.claude/scripts|python3? \\.claude/scripts|\\.claude/scripts/codex-mcp-singleton" schemas package/profile-templates tests`

## Risks

- Rendering absolute paths from source checkout instead of installed common root would bake temp/npx paths into configs.
- Updating existing user `~/.codex/config.toml` automatically could overwrite protected local config. Keep migration opt-in.
