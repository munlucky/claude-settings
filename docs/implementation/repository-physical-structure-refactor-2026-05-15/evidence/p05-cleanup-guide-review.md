# P05 Cleanup Guide Review

Reviewed: `docs/public/runtime-state-cleanup.md`

Result: pass

Evidence:

- The guide identifies `.moonshot-state/` as the selected local-only generated-state root.
- The guide lists legacy generated-state cleanup targets under `.claude/`, `.code-review-graph/`, verdict JSON, audit JSON, memory graph data, browser artifacts, traces, cache, logs, and runtime sqlite files.
- The guide explicitly says not to delete canonical source/profile paths such as `.claude/docs/phase-status.yaml`, `.claude/docs/tasks/`, `.claude/docs/guidelines/`, `.claude/scripts/`, `.claude/rules/`, `.claude/schemas/`, `.claude/templates/`, `.claude/skills/`, `package/claude/profile/`, and `package/codex/profile/`.
- Compatibility note documents that legacy `.claude/` generated state remains readable during the cleanup window while new writes should use `.moonshot-state/`.
