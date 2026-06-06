# Phase 02 - Account-Root Memory Knowledge v1

## Objective

Align memory and knowledge instructions with account-root project knowledge state. Remove stale `%USERPROFILE%/.codex`, project-local `.moonshot-relay/memorygraph`, and `.claude/memorygraph` defaults while preserving explicit legacy compatibility wording.

## Phase Execution Metadata

```yaml
phase: 02
dependsOn: [01]
ownedPaths:
  - skills/harness-memory-promoter/SKILL.md
  - skills/harness-memory-promoter/SKILL.ko.md
  - agents/project-memory-refresh.md
  - agents/project-memory-refresh.ko.md
  - skills/commit-moonshot/SKILL.ko.md
  - tests/active-contracts.test.mjs
readOnlyPaths:
  - docs/public/project-knowledge-plane.md
  - scripts/project-identity.mjs
  - scripts/lib/runtime-state-root.mjs
  - skills/commit-moonshot/SKILL.md
liveMutationPolicy: no MemoryGraph DB, account-root state, cache, or installed profile mutation
```

## Issue B1 - Harness Memory Promoter Paths

| Loop | Result |
|------|--------|
| Improvement v1 | Replace `%USERPROFILE%/.codex/state` and `.codex/harness/releases` with `.moonshot-relay/state`. |
| Review 1 | A blind replace obscures the difference between Codex profile home and account-root knowledge state. |
| Improvement v2 | Use “account-root project knowledge namespace” as the primary concept and reserve `CODEX_STATE_ROOT` for legacy override notes. |
| Review 2 | Promotion candidate input and harness release write target must be separated. |
| Final v3 | Update EN/KO skills to use `.moonshot-relay/state/projects/<projectId>/knowledge` and `.moonshot-relay/state/harness/releases`; add a guard scoped to harness-memory-promoter text. |

## Issue B2 - Project Memory Refresh Agent Write Target

| Loop | Result |
|------|--------|
| Improvement v1 | Replace “project-local backend” with account-root project knowledge MemoryGraph namespace. |
| Review 1 | Seed/cache paths under `.moonshot-relay/cache/memorygraph` are still valid as generated inputs. |
| Improvement v2 | Distinguish seed/cache from DB/write target. |
| Review 2 | Agent docs are packaged surfaces, so source-only wording must materialize correctly. |
| Final v3 | Update `agents/project-memory-refresh.*` so DB writes target account-root `knowledge/memorygraph`; keep seed/cache wording separate and legacy-labeled. |

## Issue B3 - Project ID Example Contract

| Loop | Result |
|------|--------|
| Improvement v1 | Replace `projectId: "{package-name-or-directory}"` with `projectId: "{resolved-project-id}"`. |
| Review 1 | Package/basename can still be resolver fallbacks; the issue is direct durable identity derivation. |
| Improvement v2 | Add “Project Identity Resolver output” wording and keep fallback details in resolver docs only. |
| Review 2 | Related commit examples may still use informal project labels; keep this phase focused on refresh agent input. |
| Final v3 | Update EN/KO agent examples and add tests banning the old placeholder in active memory-facing docs. |

## Issue B4 - commit-moonshot Korean Drift

| Loop | Result |
|------|--------|
| Improvement v1 | Sync Korean direct fallback wording with English so `.claude/memorygraph/memory.db` is not the default DB. |
| Review 1 | `.claude/memorygraph` can remain as legacy compatibility artifact. |
| Improvement v2 | Remove or invert raw staging example `git add [files] .claude/memory.json .claude/memorygraph`. |
| Review 2 | Korean-only fix can drift again; add active guard for raw memory staging examples. |
| Final v3 | Make Korean skill match account-root runtime-state policy, preserve explicit-approval escape hatch, and add stale phrase tests. |

## Acceptance Criteria

- No memory-facing active skill/agent presents `%USERPROFILE%/.codex/state`, project-local `.moonshot-relay/memorygraph`, or `.claude/memorygraph` as the default write target.
- `projectId` examples come from Project Identity Resolver output.
- Korean and English commit-moonshot contracts agree on raw memory artifacts staying unstaged by default.

## Verification

- `node --test tests/active-contracts.test.mjs tests/commit-memory-refresh-contract.test.mjs tests/migration-audit.test.mjs`
- Targeted scan for stale phrases:
  - `%USERPROFILE%/.codex/state`
  - `MEMORYGRAPH_DATA_DIR=<current-project>/.moonshot-relay/memorygraph`
  - `projectId: "{package-name-or-directory}"`
  - `git add [files] .claude/memory.json .claude/memorygraph`

## Risks

- Over-broad `.codex` bans can flag valid profile-home explanations. Scope tests to memory/knowledge contract blocks.
