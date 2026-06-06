# 07 MemoryGraph State Root Contract v2

## Goal

Normalize MemoryGraph state-root guidance to current `.moonshot-relay` policy and keep `.claude/**` as legacy compatibility only.

## Dependencies

- Phase 1 guard rules.

## Owned Paths

- `skills/project-memory-refresh/SKILL.md`
- `skills/project-memory-refresh/SKILL.ko.md`
- `skills/commit-moonshot/SKILL.md`
- `skills/commit-moonshot/SKILL.ko.md`
- `agents/project-memory-refresh.md`
- `README.md`
- `docs/public/project-knowledge-plane.md`
- `scripts/lib/runtime-state-root.mjs`
- `scripts/commit-moonshot-memory-refresh.mjs`
- `scripts/memorygraph-direct.mjs`
- `scripts/memorygraph-mcp-wrapper.mjs`
- `scripts/memorygraph-project-index.mjs`
- active state-root tests under `tests/`

## Work

- Update docs and skill commands to use `.moonshot-relay/state/projects/<projectId>/knowledge/**` and `.moonshot-relay/cache/memorygraph/**` as defaults.
- Remove default seed/log guidance that points to `.claude/cache/memorygraph/**`, `.claude/logs/memorygraph/**`, or `.claude/memorygraph/**`.
- Keep `.claude/**` references only as explicit legacy compatibility notes.
- Synchronize EN/KO skill variants.
- Add a guard against presenting stale `.claude/cache/memorygraph/project-graph-seed.json` as the default seed.

## Acceptance Evidence

- State-root guard reports 0 stale default `.claude/cache`/`.claude/logs` MemoryGraph guidance.
- `node scripts/memorygraph-project-index.mjs --dry-run --max-files 1` emits the current default policy.
- `node scripts/commit-moonshot-memory-refresh.mjs --project-id <smoke> --json --timeout-ms <bounded>` writes or reports logs under the current state root.

## Phase Boundary

Do not migrate or delete user account-root MemoryGraph state as part of this source-contract cleanup.
