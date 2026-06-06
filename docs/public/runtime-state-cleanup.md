# Runtime State Cleanup

Generated runtime state now lives under `.moonshot-relay/`. That directory is local-only state and is ignored by git and package materialization.

Safe generated-state cleanup targets:

- `.moonshot-relay/`
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

Do not delete service profile files such as `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, `.codex/skills/`, `.codex/agents/`, `.codex/rules/`, `package/profile-templates/`, or `package/build-package.mjs` as part of state cleanup. Common harness files live under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`. Legacy non-exposed `.claude/docs/public/`, `.claude/scripts/`, `.claude/schemas/`, `.claude/templates/`, `.claude/bin/`, and `.claude/tools/` copies may be backed up and removed by the account-root installer.

Compatibility note: legacy generated state under `.claude/` remains readable during the cleanup window, but new harness writes should use the account-root project knowledge namespace under `.moonshot-relay/state/projects/<projectId>/knowledge`. `MOONSHOT_STATE_ROOT` and `PHASE_RUNTIME_STATE_ROOT` are legacy compatibility overrides and affect new runtime writes only when `MOONSHOT_RELAY_LEGACY_STATE_OVERRIDE=1` is also set. Existing `.moonshot-state/` content should be moved into `.moonshot-relay/` before deleting the old directory.
