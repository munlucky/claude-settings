# P05 State Root Decision

- Selected default generated-state root: `.moonshot-state/`
- Compatibility fallback root: legacy `.claude/` generated-state paths remain readable through resolver helpers during the cleanup window.
- Config override: `MOONSHOT_STATE_ROOT` or `PHASE_RUNTIME_STATE_ROOT`.
- Git ignore coverage: `.moonshot-state/`, `.claude/state/`, legacy `.claude` generated-state paths, verdict JSON, audit JSON, and `.code-review-graph/`.

Touched resolver/writer paths:

- `.claude/scripts/lib/runtime-state-root.mjs`
- `.claude/scripts/runtime-state.mjs`
- `.claude/scripts/memorygraph-mcp-wrapper.mjs`
- `.claude/scripts/code-review-graph-mcp-wrapper.js`
- `.claude/scripts/codex-mcp-singleton.mjs`
- `.claude/scripts/lib/phase-event-ledger.mjs`
- `.claude/scripts/lib/phase-run-lease-store.mjs`
- `.claude/scripts/lib/runtime-unavailable-cache.mjs`
- `.claude/scripts/lib/harness-state-invariants.mjs`
