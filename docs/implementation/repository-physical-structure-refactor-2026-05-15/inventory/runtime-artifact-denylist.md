# Runtime Artifact Denylist

Phase: P01 - Source Boundary Inventory

Evidence:

- `docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p01-runtime-state-rg.txt`
- `.gitignore`
- `docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/path-boundary-map.yaml`

## Denylist Decisions

| Runtime artifact | Class | Ignore state | Package decision | Notes |
| --- | --- | --- | --- | --- |
| `.claude/logs` | `generated_state` | Existing `.gitignore`: `.claude/logs` | Exclude | Runtime logs, agent-loop logs, MCP logs, trace logs. |
| `.claude/cache/` | `generated_state` | Existing `.gitignore`: `.claude/cache/` | Exclude | Local caches, memorygraph cache, preflight cache. |
| `.claude/traces/` | `generated_state` | Existing `.gitignore`: `.claude/traces/` and `.claude/.claude/traces/` | Exclude | Runtime dispatch traces. |
| `.claude/browser-artifacts/` | `generated_state` | Existing `.gitignore`: `.claude/browser-artifacts/` | Exclude | Browser screenshots, visual diffs, run artifacts. |
| `.claude/browser-runtime/` | `generated_state` | Existing `.gitignore`: `.claude/browser-runtime/` | Exclude | Local browser runtime materialization. |
| `.claude/runtime-state.sqlite*` | `generated_state` | Existing `.gitignore`: `.claude/runtime-state.sqlite*` | Exclude | SQLite runtime state and sidecars. |
| `.claude/memorygraph/` | `generated_state` | Existing `.gitignore`: `.claude/memorygraph/` | Exclude | Runtime graph data. |
| `.claude/memory.json` | `generated_state` | Existing `.gitignore`: `.claude/memory.json` | Exclude | Runtime memory state. |
| `.claude/*verdict*.json` | `generated_state` | Existing `.gitignore`: `.claude/verification-verdict-*.json`, `.claude/runtime-verdict-*.json`, `.claude/browser-flow-verdict-*.json`, `.claude/visual-diff-verdict-*.json`, `.claude/verification-verdict**.json` | Exclude | Structured verifier/browser/visual verdict outputs. |
| `.claude/knowledge-repo-audit-*.json` | `generated_state` | Existing `.gitignore`: `.claude/knowledge-repo-audit-*.json` | Exclude | Knowledge repository audit outputs. |
| `.code-review-graph/` | `generated_state` | Existing `.gitignore`: `.code-review-graph/` | Exclude | Local CRG output. |
| `.claude/docs/reports/*.json` | `generated_state` | Existing `.gitignore`: `.claude/docs/reports/*.json` | Exclude | Generated report JSON. |
| `.claude/tools/browserd/node_modules/` | `generated_state` | Existing `.gitignore`: `.claude/tools/browserd/node_modules/` | Exclude | Installed dependency tree, not source. |
| `.claude/tools/browserd/.claude/` | `generated_state` | Existing `.gitignore`: `.claude/tools/browserd/.claude/` | Exclude | Nested tool runtime state. |
| `.claude/tmp/` | `generated_state` | Proposed rule: `.claude/tmp/` | Exclude | First-level temporary runtime workspace is present and should be ignored explicitly. |

## Package Exclusion Rule

Package builders and installers should exclude every `generated_state` row above by default. Later phases may add compatibility wrappers, but wrappers must not package historical logs, caches, traces, browser artifacts, sqlite state, memorygraph data, verdict JSON, audit JSON, or memory state.

## Review Notes

- The phase evidence search intentionally includes `.claude`, `docs`, installers, and top-level docs so generated-state references in scripts, docs, tests, skills, agents, and installers are visible.
- Raw evidence is retained in `p01-runtime-state-rg.txt`; this denylist records the migration/package decision so later implementation agents do not infer intent from raw matches.
