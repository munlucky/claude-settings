# Ponytail Policy Compatibility

Observed commit: `17a466013e7956f91418d188a960754ba26a1bdf`

| Moonshot Constraint | Ponytail Behavior | Compatibility Decision | Required Mitigation |
|---|---|---|---|
| Canonical source stays in tracked root directories, not live `.claude/` or `.codex/`. | Ponytail plugin hooks use host plugin roots and host state paths. | Compatible only as reference input in Phase 01/02. | Do not install plugin or copy hooks. |
| `runtime-state.sqlite` remains workflow authority. | Ponytail mode hooks emit hidden context and write `.ponytail-active`. | Potential authority confusion if installed automatically. | Keep Ponytail guidance in source docs; do not use hook state as completion or workflow authority. |
| `package/runtime-surface.json` is allowlist-only. | Ponytail provides public skills and Codex plugin surface. | Not compatible with automatic public runtime surface expansion. | Phase 03/04 must explicitly approve any managed skill/runtime-surface change. |
| Live account-root/profile sync requires Operational Adoption Closeout. | Ponytail lifecycle hooks are designed for live host integration. | Not compatible with early phases. | Keep live adoption skipped unless Phase 05 has explicit approval and parity evidence. |
| External skill transfer should extract reusable mechanics, not copy prompts wholesale. | Ponytail instruction text contains useful YAGNI/stdlib/native ladder and safety exclusions. | Compatible as source-pinned input. | Write a Moonshot-specific guideline, preserving verification and safety gates. |
| Verification and closeout evidence cannot be weakened. | Ponytail favors shorter diffs and fewer tests for trivial logic. | Compatible only with explicit safety exclusions. | Phase 02 static gate must confirm runtime-state, security, accessibility, validation, and closeout evidence remain mandatory. |

Recommendation: `instruction_tier_only` first. Create a compact Moonshot guideline in Phase 02. Do not add a Ponytail skill, plugin, hook, dependency, or runtime-surface entry in the initial adoption branch.
