# Runtime State Cleanup

Phase 05 moves generated runtime state to `.moonshot-state/`. That directory is local-only state and is ignored by git and package materialization.

Safe generated-state cleanup targets:

- `.moonshot-state/`
- `.claude/state/`
- `.claude/logs/`
- `.claude/cache/`
- `.claude/traces/`
- `.claude/browser-artifacts/`
- `.claude/browser-runtime/`
- `.claude/memorygraph/`
- `.claude/runtime-state.sqlite*`
- `.claude/memory.json`
- `.claude/*verdict*.json`
- `.claude/verification-verdict-phase05-final.json`
- `.claude/knowledge-repo-audit-*.json`
- `.code-review-graph/`

Do not delete `.claude/docs/phase-status.yaml`, `.claude/docs/tasks/`, `.claude/docs/guidelines/`, `.claude/scripts/`, `.claude/rules/`, `.claude/schemas/`, `.claude/templates/`, `.claude/skills/`, `package/profile-templates/`, or `package/build-package.mjs` as part of state cleanup. Ignored generated profile roots under `package/claude/profile/` and `package/codex/profile/` may be regenerated with `node package/build-package.mjs --runtime all --clean`.

Compatibility note: legacy generated state under `.claude/` remains readable during the cleanup window, but new harness writes should use `.moonshot-state/` unless an explicit environment override such as `MOONSHOT_STATE_ROOT` or `PHASE_RUNTIME_STATE_ROOT` is set.
