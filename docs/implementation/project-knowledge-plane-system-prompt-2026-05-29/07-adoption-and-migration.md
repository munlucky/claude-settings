# Phase 07 - Adoption and Migration

## Phase Execution Metadata
```yaml
phase: 07
title: "Adoption and Migration"
dependsOn: [01, 02, 03, 04, 05, 06]
conflicts: []
ownedPaths:
  - ".claude/schemas/project-identity.schema.json"
  - ".claude/schemas/knowledge-contract.schema.json"
  - ".claude/schemas/knowledge-record.schema.json"
  - ".claude/schemas/knowledge-provenance.schema.json"
  - ".claude/schemas/ontology-constraint.schema.json"
  - ".claude/schemas/improvement-proposal.schema.json"
  - ".claude/scripts/project-identity.mjs"
  - ".claude/scripts/project-identity.test.mjs"
  - ".claude/scripts/knowledge-records.mjs"
  - ".claude/scripts/knowledge-records.test.mjs"
  - ".claude/scripts/knowledge-context-build.mjs"
  - ".claude/scripts/knowledge-context-build.test.mjs"
  - ".claude/scripts/ontology-constraint-validate.mjs"
  - ".claude/scripts/ontology-constraint-validate.test.mjs"
  - ".claude/scripts/knowledge-improvement-lifecycle.mjs"
  - ".claude/scripts/knowledge-improvement-lifecycle.test.mjs"
  - ".claude/scripts/memorygraph-project-index.mjs"
  - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
  - ".claude/scripts/phase-worktree-coordinator.mjs"
  - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
  - ".claude/scripts/harness-surface-inventory.mjs"
  - ".claude/workflow.registry.yaml"
  - ".claude/verification.contract.yaml"
  - ".claude/docs/guidelines/project-knowledge-plane.md"
  - ".claude/skills/moonshot-phase-runner/SKILL.md"
  - ".claude/skills/moonshot-phase-executor/SKILL.md"
  - ".claude/skills/moonshot-in-session-coordinator/SKILL.md"
  - ".claude/skills/moonshot-orchestrator/SKILL.md"
  - ".claude/skills/product-orchestrator/SKILL.md"
  - ".claude/skills/project-memory-refresh/SKILL.md"
  - ".claude/skills/project-memory-refresh/SKILL.ko.md"
  - ".claude/skills/commit-moonshot/SKILL.md"
  - ".claude/skills/commit-moonshot/SKILL.ko.md"
  - ".claude/skills/session-logger/SKILL.md"
  - ".claude/skills/harness-memory-promoter/SKILL.md"
  - ".claude/skills/doc-auto-sync/SKILL.md"
  - ".claude/skills/moonshot-plan-writer/SKILL.md"
  - ".claude/agents/project-memory-agent.md"
  - ".claude/agents/project-memory-agent.ko.md"
  - ".claude/agents/project-memory-check.md"
  - ".claude/agents/project-memory-check.ko.md"
  - ".claude/agents/project-memory-reviewer.md"
  - ".claude/agents/project-memory-reviewer.ko.md"
  - ".claude/agents/phase-attempt-agent.md"
  - ".claude/agents/phase-attempt-agent.ko.md"
  - ".codex/skills/moonshot-phase-runner/SKILL.md"
  - ".codex/skills/moonshot-phase-executor/SKILL.md"
  - ".codex/skills/moonshot-in-session-coordinator/SKILL.md"
  - ".codex/skills/moonshot-orchestrator/SKILL.md"
  - ".codex/skills/product-orchestrator/SKILL.md"
  - ".codex/skills/project-memory-refresh/SKILL.md"
  - ".codex/skills/project-memory-refresh/SKILL.ko.md"
  - ".codex/skills/commit-moonshot/SKILL.md"
  - ".codex/skills/commit-moonshot/SKILL.ko.md"
  - ".codex/skills/session-logger/SKILL.md"
  - ".codex/skills/harness-memory-promoter/SKILL.md"
  - ".codex/skills/doc-auto-sync/SKILL.md"
  - ".codex/skills/moonshot-plan-writer/SKILL.md"
  - ".codex/agents/project-memory-agent.md"
  - ".codex/agents/project-memory-agent.ko.md"
  - ".codex/agents/project-memory-check.md"
  - ".codex/agents/project-memory-check.ko.md"
  - ".codex/agents/project-memory-reviewer.md"
  - ".codex/agents/project-memory-reviewer.ko.md"
  - ".codex/agents/phase-attempt-agent.md"
  - ".codex/agents/phase-attempt-agent.ko.md"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/**"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-07/**"
adoptionTargets:
  - ".claude/schemas/project-identity.schema.json"
  - ".claude/schemas/knowledge-contract.schema.json"
  - ".claude/schemas/knowledge-record.schema.json"
  - ".claude/schemas/knowledge-provenance.schema.json"
  - ".claude/schemas/ontology-constraint.schema.json"
  - ".claude/schemas/improvement-proposal.schema.json"
  - ".claude/scripts/project-identity.mjs"
  - ".claude/scripts/project-identity.test.mjs"
  - ".claude/scripts/knowledge-records.mjs"
  - ".claude/scripts/knowledge-records.test.mjs"
  - ".claude/scripts/knowledge-context-build.mjs"
  - ".claude/scripts/knowledge-context-build.test.mjs"
  - ".claude/scripts/ontology-constraint-validate.mjs"
  - ".claude/scripts/ontology-constraint-validate.test.mjs"
  - ".claude/scripts/knowledge-improvement-lifecycle.mjs"
  - ".claude/scripts/knowledge-improvement-lifecycle.test.mjs"
  - ".claude/scripts/memorygraph-project-index.mjs"
  - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
  - ".claude/scripts/phase-worktree-coordinator.mjs"
  - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
  - ".claude/scripts/harness-surface-inventory.mjs"
  - ".claude/workflow.registry.yaml"
  - ".claude/verification.contract.yaml"
  - ".claude/docs/guidelines/project-knowledge-plane.md"
  - ".claude/skills/moonshot-phase-runner/SKILL.md"
  - ".claude/skills/moonshot-phase-executor/SKILL.md"
  - ".claude/skills/moonshot-in-session-coordinator/SKILL.md"
  - ".claude/skills/moonshot-orchestrator/SKILL.md"
  - ".claude/skills/product-orchestrator/SKILL.md"
  - ".claude/skills/project-memory-refresh/SKILL.md"
  - ".claude/skills/project-memory-refresh/SKILL.ko.md"
  - ".claude/skills/commit-moonshot/SKILL.md"
  - ".claude/skills/commit-moonshot/SKILL.ko.md"
  - ".claude/skills/session-logger/SKILL.md"
  - ".claude/skills/harness-memory-promoter/SKILL.md"
  - ".claude/skills/doc-auto-sync/SKILL.md"
  - ".claude/skills/moonshot-plan-writer/SKILL.md"
  - ".claude/agents/project-memory-agent.md"
  - ".claude/agents/project-memory-agent.ko.md"
  - ".claude/agents/project-memory-check.md"
  - ".claude/agents/project-memory-check.ko.md"
  - ".claude/agents/project-memory-reviewer.md"
  - ".claude/agents/project-memory-reviewer.ko.md"
  - ".claude/agents/phase-attempt-agent.md"
  - ".claude/agents/phase-attempt-agent.ko.md"
  - ".codex/skills/moonshot-phase-runner/SKILL.md"
  - ".codex/skills/moonshot-phase-executor/SKILL.md"
  - ".codex/skills/moonshot-in-session-coordinator/SKILL.md"
  - ".codex/skills/moonshot-orchestrator/SKILL.md"
  - ".codex/skills/product-orchestrator/SKILL.md"
  - ".codex/skills/project-memory-refresh/SKILL.md"
  - ".codex/skills/project-memory-refresh/SKILL.ko.md"
  - ".codex/skills/commit-moonshot/SKILL.md"
  - ".codex/skills/commit-moonshot/SKILL.ko.md"
  - ".codex/skills/session-logger/SKILL.md"
  - ".codex/skills/harness-memory-promoter/SKILL.md"
  - ".codex/skills/doc-auto-sync/SKILL.md"
  - ".codex/skills/moonshot-plan-writer/SKILL.md"
  - ".codex/agents/project-memory-agent.md"
  - ".codex/agents/project-memory-agent.ko.md"
  - ".codex/agents/project-memory-check.md"
  - ".codex/agents/project-memory-check.ko.md"
  - ".codex/agents/project-memory-reviewer.md"
  - ".codex/agents/project-memory-reviewer.ko.md"
  - ".codex/agents/phase-attempt-agent.md"
  - ".codex/agents/phase-attempt-agent.ko.md"
readOnlyPaths:
  - ".claude/memorygraph/**"
  - ".claude/cache/memorygraph/**"
  - ".claude/logs/**"
sharedMutablePaths:
  - ".claude/workflow.registry.yaml"
  - ".claude/verification.contract.yaml"
mergePolicy: "controlled adoption with dry-run, rollback manifest, and mirror parity"
liveMutationPolicy: "this is the only live adoption phase"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-008 | AC-008 | Live adoption only after staged validation. | adoption dry-run/apply manifest |

## Goal
Adopt the staged Knowledge Plane into live harness surfaces safely and prepare migration guidance for existing project-local MemoryGraph users.

## Scope
- Add adoption dry-run and rollback manifest.
- Verify `.claude` / `.codex` skill mirror parity.
- Confirm existing `.claude/memorygraph/**` and `.claude/cache/memorygraph/**` remain unstaged and unmigrated unless explicitly requested.
- Produce migration guide for downstream projects.
- Produce backward compatibility evidence that existing `.claude/memorygraph/**`, `.claude/cache/memorygraph/**`, `.claude/logs/**`, and account-root project state are not deleted, staged, or rewritten during adoption.
- Snapshot account-root paths before and after adoption without mutating them: `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge`, `%USERPROFILE%/.codex/state/projects/<projectId>/execution`, and `%USERPROFILE%/.codex/state/project-registry.json`.

## Non-Scope
- Do not bulk-migrate all projects.
- Do not delete old project-local MemoryGraph DBs.
- Do not auto-edit account-root `.codex` outside approved adoption targets.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Add adoption inventory and exact target allowlist. | adoption helper/evidence | `node .claude/scripts/harness-surface-inventory.mjs --json` | all targets classified | broad `.claude/**` without allowlist |
| T02 | Run staged tests from Phases 01-06. | all staged tests | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-01/.claude/scripts/project-identity.test.mjs docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.test.mjs docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-03/.claude/scripts/knowledge-context-build.test.mjs docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-05/.claude/scripts/ontology-constraint-validate.test.mjs docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-06/.claude/scripts/knowledge-improvement-lifecycle.test.mjs` | all pass | any stage test fails |
| T03 | Apply controlled adoption with rollback manifest. | live targets | adoption helper dry-run/apply | rollback paths recorded | no rollback for target |
| T04 | Run global verification. | verification outputs | `bash .claude/scripts/verify-phase-runner-boundary.sh`; `node .claude/scripts/harness-propagation-parity.mjs --json`; `git diff --check` | pass | mirror drift or boundary failure |
| T05 | Run no-delete/no-stage compatibility check. | git status + adoption manifest | `git status --short --ignored .claude/memorygraph .claude/cache/memorygraph .claude/logs` | memory/cache/log paths remain ignored or unstaged | any raw state staged/deleted |
| T06 | Run account-root no-rewrite snapshot check. | account-root snapshot manifest | `node .claude/scripts/project-identity.mjs --cwd . --json` plus before/after file hash listing for account-root state paths | account-root knowledge/execution files are unchanged unless migration is explicitly requested | account-root state rewritten during adoption |

## Acceptance Criteria
- AC-008: Live adoption uses exact allowlist and rollback manifest.
- AC-014: Existing project-local memory/cache/log artifacts are preserved and unstaged by default.
- AC-015: Downstream migration guide explains account-root project knowledge namespace and repo portable evidence mirrors.
- AC-019: Adoption evidence proves existing project-local MemoryGraph/cache/log users are preserved and unstaged by default.

## Verification Plan
- `node --test .claude/scripts/project-identity.test.mjs .claude/scripts/knowledge-records.test.mjs .claude/scripts/knowledge-context-build.test.mjs .claude/scripts/ontology-constraint-validate.test.mjs .claude/scripts/knowledge-improvement-lifecycle.test.mjs`
- `node .claude/scripts/harness-surface-inventory.mjs --json`
- `node .claude/scripts/harness-propagation-parity.mjs --json`
- `bash .claude/scripts/verify-phase-runner-boundary.sh`
- `git diff --check -- .claude .codex docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Adoption allowlist and rollback manifest exist.
- [ ] All staged tests pass before live adoption.
- [ ] Mirror parity and boundary verification pass after adoption.
- [ ] Migration guide preserves project-local memory by default.
