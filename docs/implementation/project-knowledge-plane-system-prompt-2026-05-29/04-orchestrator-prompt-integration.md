# Phase 04 - Orchestrator Prompt Integration

## Phase Execution Metadata
```yaml
phase: 04
title: "Orchestrator Prompt Integration"
dependsOn: [03]
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/moonshot-phase-runner/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/moonshot-orchestrator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/product-orchestrator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/moonshot-phase-executor/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/moonshot-in-session-coordinator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/project-memory-refresh/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/project-memory-refresh/SKILL.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/commit-moonshot/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/commit-moonshot/SKILL.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/doc-auto-sync/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/skills/moonshot-plan-writer/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-agent.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-agent.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-check.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-check.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-reviewer.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/project-memory-reviewer.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/phase-attempt-agent.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/agents/phase-attempt-agent.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/moonshot-phase-runner/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/moonshot-orchestrator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/product-orchestrator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/moonshot-phase-executor/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/moonshot-in-session-coordinator/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/project-memory-refresh/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/project-memory-refresh/SKILL.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/commit-moonshot/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/commit-moonshot/SKILL.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/doc-auto-sync/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/skills/moonshot-plan-writer/SKILL.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-agent.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-agent.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-check.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-check.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-reviewer.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/project-memory-reviewer.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/phase-attempt-agent.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.codex/agents/phase-attempt-agent.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/phase-worktree-coordinator.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/agent-loop-phase-plan-lib.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/knowledge-context-build.test.mjs"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/skills/**"
  - ".codex/skills/**"
  - ".claude/scripts/**"
  - ".claude/memorygraph/**"
  - ".claude/logs/**"
sharedMutablePaths:
  - ".claude/workflow.registry.yaml"
mergePolicy: "entrypoint docs and runtime callsites must stay mirror-parity clean"
liveMutationPolicy: "staged only"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-005 | AC-005 | Orchestrators must use project knowledge context. | integration tests |

## Goal
Ensure phase runner and bounded/product orchestrators attach `Project Knowledge Context` to attempt/system prompts through a deterministic helper, without giving raw memory/graph data to agents.

## Scope
- Add prompt assembly contract to entrypoint skills.
- Add runtime callsite integration where prompts are assembled.
- Keep helper failure advisory unless strict memory validation is requested.
- Keep Codex skill mirrors synchronized.

## Affected Surface Decisions
| Surface | Decision | Reason |
|---------|----------|--------|
| `moonshot-phase-runner` | migrate | public phase attempts need Project Knowledge Context |
| `moonshot-phase-executor` | migrate | delegated-terminal adapter must not bypass context builder |
| `moonshot-in-session-coordinator` | migrate | forked-agent prompt handoff must include summary block |
| `moonshot-orchestrator` | migrate | bounded implementation uses same context contract |
| `product-orchestrator` | update | product docs work gets advisory context only |
| `project-memory-refresh` | defer to Phase 07 docs | refresh writes project knowledge but does not build prompts |
| `doc-auto-sync` | update | documentation sync may seed knowledge but must not write semantic facts during prompt assembly |
| `moonshot-plan-writer` | update | planning intake may consume compact knowledge context and must record typed omissions |
| `commit-moonshot` memory refresh | defer to Phase 07 docs | closeout memory refresh remains non-blocking and unstaged |
| `session-logger` | update via lifecycle phase | writes observations, not prompt context |
| `.claude/agents/project-memory-agent*` | migrate | forked recall agent must return Project Knowledge Context shape only |
| `.claude/agents/project-memory-check*` | migrate | strict/advisory matrix must use typed degraded status |
| `.claude/agents/project-memory-reviewer*` | migrate | review must inspect provenance/trust tiers rather than raw records |
| `.claude/agents/phase-attempt-agent*` | migrate | execution agent consumes `projectKnowledgeContext`, not raw graph or old `projectMemoryContext` |
| `.codex/agents/*` mirrors | migrate | Codex mirrors must stay parity-clean with `.claude` agents |

## Non-Scope
- Do not alter project implementation behavior.
- Do not make MemoryGraph a required dependency for all tasks.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Update staged entrypoint skill contracts to require knowledge context builder before attempt prompt creation. | skill docs + mirrors | `bash .claude/scripts/verify-phase-runner-boundary.sh --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04` | boundary passes | mirror drift |
| T02 | Integrate builder into phase/worker prompt assembly. | runtime scripts | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/knowledge-context-build.test.mjs .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | prompt contains context block | raw memory leaks |
| T03 | Add strict/advisory handling. | tests | same test | strict memory task blocks unavailable; default degrades | MemoryGraph unavailable blocks normal task |
| T04 | Add status evidence into attempt manifest or workflow metadata. | runtime scripts | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/lib/phase-attempt-manifest.test.mjs` | manifest references knowledge status, not raw data | unverifiable prompt mutation |
| T05 | Update staged memory/attempt agents to consume and return the typed context shape. | agent docs + mirrors | `node .claude/scripts/harness-propagation-parity.mjs --json --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04` | agent mirrors include identical summary-only contract | old `projectMemoryContext` contract remains authoritative |
| T06 | Update staged planning/doc surfaces that can seed or consume memory. | `moonshot-plan-writer`, `doc-auto-sync`, `project-memory-refresh` | same parity command | seed-only and compact-intake boundaries are explicit | semantic fact writes occur in prompt assembly |

## Acceptance Criteria
- AC-005: Phase attempt prompt includes `## Project Knowledge Context` when configured.
- AC-008: Helper unavailable state appears as typed degraded capability unless strict memory gate is active.
- AC-009: `.claude` and `.codex` skill mirrors stay synchronized.
- AC-016: Staged integration proves no live `.claude/.codex` path changed before Phase 07.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04/.claude/scripts/knowledge-context-build.test.mjs`
- `bash .claude/scripts/verify-phase-runner-boundary.sh --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04`
- `node .claude/scripts/harness-propagation-parity.mjs --json --overlay-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-04`
- `git diff --check -- .claude .codex docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Entrypoint skills name the new prompt context contract.
- [ ] Runtime prompt tests prove summary-only injection.
- [ ] Mirror parity passes.
