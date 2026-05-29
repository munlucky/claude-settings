# Phase 01 - Identity and Storage Contract

## Phase Execution Metadata
```yaml
phase: 01
title: "Identity and Storage Contract"
dependsOn: []
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/schemas/project-identity.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/schemas/knowledge-contract.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.test.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/docs/guidelines/project-knowledge-plane.md"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/schemas/**"
  - ".claude/scripts/**"
  - ".claude/docs/guidelines/**"
  - ".claude/memorygraph/**"
  - ".claude/cache/memorygraph/**"
  - ".claude/logs/**"
  - ".codex/**"
sharedMutablePaths:
  - ".claude/workflow.registry.yaml"
mergePolicy: "staged overlay first, live adoption in Phase 07 only"
liveMutationPolicy: "no live .claude/.codex adoption in this phase"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-001 | AC-001 | Account-root harness covers multiple projects. | `project-identity.test.mjs`, contract fixture |
| REQ-002 | AC-002 | Knowledge state is project-scoped, worktree only execution-scoped. | namespace matrix test |

## Goal
Define stable project identity and state namespace rules so account-root harness can serve many projects without cross-project bleed or worktree knowledge fragmentation.

## Scope
- Create the project identity contract and resolver behavior.
- Define default account-root state layout.
- Define which state is project-scoped versus execution/worktree/run-scoped.
- Define repo-local portable mirrors and manifests.
- Define account-root registry path: `%USERPROFILE%/.codex/state/project-registry.json`.
- Define collision policy: explicit identity wins; alias collision blocks with `project_identity_collision`; fallback collision requires user-confirmed registry entry.

## Non-Scope
- Do not migrate existing MemoryGraph data.
- Do not change live orchestrator prompts.
- Do not write account-root state except in tests/fixtures.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Define `.claude/project.identity.yaml` shape with immutable `projectId`, aliases, canonical remote, owner, createdAt, and migratedFrom. | schema + guideline | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.test.mjs` | explicit identity beats fallback | schema cannot represent aliases |
| T02 | Implement resolver order and registry lookup: explicit identity, `%USERPROFILE%/.codex/state/project-registry.json` alias, git remote slug, package name, git root basename, path hash. | `project-identity.mjs` | `HARNESS_OVERLAY_ROOT=docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01 node $HARNESS_OVERLAY_ROOT/.claude/scripts/project-identity.mjs --cwd . --json` | stable logical id across rename fixtures | collision unhandled |
| T03 | Define namespace matrix: knowledge under `projects/<projectId>/knowledge`; execution under `projects/<projectId>/execution/worktrees/<worktreeId>/branches/<branchId>/runs/<runId>`. | guideline + tests | same test | same project different worktree shares knowledge root but not execution root | worktree affects knowledge path |
| T04 | Define repo mirror policy: repo keeps contracts, summaries, manifests; raw account-root state is not committed. | guideline | `git diff --check` | policy names portable artifacts | raw state listed as repo source |
| T05 | Wrap existing package/basename `projectId` derivations behind the resolver or record explicit defer decisions. | migration inventory | same test | every project id surface in the migration matrix is `migrate`, `wrap`, `defer`, or `no-op` | fallback scripts create divergent projectId |

## ProjectId Migration Matrix
| Surface | Current Derivation Risk | Required Decision |
|---------|-------------------------|-------------------|
| `.claude/scripts/memorygraph-project-index.mjs` | `package.json` name then cwd basename | `wrap` with `project-identity.mjs`; retain fallback only inside resolver |
| `.claude/scripts/commit-moonshot-memory-refresh.mjs` | `--project-id` or package/basename default | `wrap`; CLI keeps `--project-id` override but default uses resolver |
| `.claude/skills/project-memory-refresh/SKILL.md` and `.ko.md` | instructs package/basename derivation | `migrate` docs in Phase 07 |
| `.claude/skills/commit-moonshot/SKILL.md` and `.ko.md` | instructs or invokes project id derivation | `migrate` docs in Phase 07 |
| `.codex/skills/project-memory-refresh/SKILL.md` and `.ko.md` | instructs package/basename derivation | `migrate` docs in Phase 07 |
| `.codex/skills/commit-moonshot/SKILL.md` and `.ko.md` | instructs or invokes project id derivation | `migrate` docs in Phase 07 |
| `.claude/agents/project-memory-agent.md` and `.ko.md` | package/basename command snippet | `migrate` agent contract in Phase 04/07 |
| `.codex/agents/project-memory-agent.md` and `.ko.md` | mirror of package/basename snippet | `migrate` mirror in Phase 07 |
| `.claude/agents/phase-attempt-agent.md` and `.ko.md` | consumes projectMemoryContext, may trigger memory agent | `migrate` to projectKnowledgeContext |
| `.codex/agents/phase-attempt-agent.md` and `.ko.md` | mirror of phase attempt behavior | `migrate` mirror in Phase 07 |
| `commit-moonshot-promotion-audit.mjs` | has explicit project id option/default | `defer` unless default derivation bypasses resolver in implementation review |
| `awtl-memory-promotion.mjs` | consumes provided projectId | `no-op` for identity resolver; Phase 06 handles promotion semantics |

## Acceptance Criteria
- AC-001: Resolver returns one stable project knowledge namespace for the same logical project across path/package/worktree changes.
- AC-002: Resolver returns distinct execution namespaces for different worktrees/runs while sharing project knowledge root.
- AC-003: Contract states repo-local `.claude/cache/knowledge/**` is derived mirror, not authoritative knowledge source.
- AC-016: Pre-adoption test and CLI commands execute from `HARNESS_OVERLAY_ROOT`; live `.claude/.codex` files remain unchanged until Phase 07.
- AC-017: No package/basename project id derivation remains outside `project-identity.mjs` unless listed in the migration matrix with `defer` or `no-op` rationale.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.test.mjs`
- `node docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.mjs --cwd docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/fixtures/explicit-identity --json`
- `git diff --check -- .claude docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Identity schema exists and validates fixtures.
- [ ] Namespace matrix test covers same-project/multi-worktree behavior.
- [ ] Project-local raw state exclusion is documented.
