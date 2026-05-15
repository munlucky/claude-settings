# Repository Physical Structure Refactor QA

## Harness Change Ledger
| Change Area | Paths | Evidence | Risk Control |
|-------------|-------|----------|--------------|
| Runtime state root extraction | `.claude/scripts/runtime-state.mjs`, `.claude/scripts/lib/runtime-state-root.mjs`, `.claude/scripts/lib/phase-event-ledger.mjs`, `.claude/scripts/lib/phase-run-lease-store.mjs`, `.claude/scripts/lib/runtime-unavailable-cache.mjs` | Phase 05 QA, `tests/migration-audit.test.mjs`, `.claude/verification-verdict-phase05-final.json` | New writes default to `.moonshot-state/`; legacy `.claude` compatibility reads stay explicit. |
| MCP/cache wrapper state routing | `.claude/scripts/memorygraph-mcp-wrapper.mjs`, `.claude/scripts/code-review-graph-mcp-wrapper.js`, `.claude/scripts/codex-mcp-singleton.mjs` | Phase 05 QA review checkpoint and migration audit | Wrapper state paths move through the shared resolver; child env carries the expected data root. |
| Package and cleanup guardrails | `.gitignore`, `tests/package-materialization.test.mjs`, `docs/public/runtime-state-cleanup.md` | `node --test tests/package-materialization.test.mjs --test-name-pattern "excludes runtime state"` and cleanup guide review evidence | Generated state roots are excluded from package payloads and documented as delete-only runtime artifacts. |
