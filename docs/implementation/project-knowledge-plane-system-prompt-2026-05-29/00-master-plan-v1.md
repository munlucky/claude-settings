# Project Knowledge Plane System Prompt Master Plan v1

> This document is the plan of all plans.

## Source Baseline
- User request in current session (role: scope/priority): account-root harness must cover multiple projects while project memory, KG, ontology, and system prompt context stay project-scoped.
- User-provided research synthesis (role: technical direction): preserve project namespace, summary-only prompt injection, typed knowledge plane, provenance, supersession, executable ontology constraints, and recursive improvement lifecycle.
- Existing harness contracts (role: brownfield contract): `.claude/workflow.registry.yaml`, `.claude/verification.contract.yaml`, `memorygraph-project-index.mjs`, `memorygraph-direct.mjs`, `moonshot-phase-runner`, `moonshot-orchestrator`, `product-orchestrator`, and `commit-moonshot` memory policy.

## Objective
Design and implement a project-scoped Knowledge Plane that can be installed under account-root `.codex/.claude`, serve multiple projects, and inject only compact verified project knowledge into system/attempt prompts. The design must keep knowledge state project-scoped, keep execution state worktree/run-scoped, prevent raw graph/log/transcript prompt injection, and support project and harness recursive improvement.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 4
  isolationMode: "forked"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.0
  ambiguityScore: 0.16
  decision: "pass"
  reviewerSessions: ["019e7400-83d7-76f3-b4d6-5a834d339689", "019e7407-b217-7ad3-8c52-f4d6190b7b96", "019e7411-14f7-75b3-9440-671fd3fd47d4", "019e7417-7c44-7410-8115-9b1715a41e38"]
  writerSessions: ["parent-session"]
  artifactRoot: "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/planning-loop"
  latestReview: "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/planning-loop/plan-quality-review-iter-04.yaml"
  latestWriterRevision: "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/planning-loop/plan-writer-revision-iter-03.yaml"
  appliedFindings: ["BF2-001", "BF2-002", "BF2-003", "BF2-004", "BF2-005", "ID2-002", "ID2-003", "ID2-004", "BF3-001", "NF3-001"]
  blockingFindings: []
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

Strict runnable readiness requires `ambiguityScore <= 0.20`, no blocking findings, no actionable improvement directives, and forked reviewer evidence. Child reviewers are read-only; parent session owns edits.

## Plan Package Readiness
```yaml
planPackageReadiness:
  mode: "prep_phase_required"
  selectedMasterPlan: "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/00-master-plan-v1.md"
  selectedPhaseDocs:
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/01-identity-and-storage-contract.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/02-typed-knowledge-schema-and-provenance.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/03-knowledge-context-builder.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/04-orchestrator-prompt-integration.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/05-ontology-and-verifier-constraints.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/06-recursive-improvement-lifecycle.md"
    - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/07-adoption-and-migration.md"
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: "classify_before_edit"
  runtimePointerAction: "archive_before_dispatch"
  archiveRoot: "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/archive/"
  dryRunCommand: "node .claude/scripts/prepare-implementation-plan-state.mjs --dry-run --plan-dir docs/implementation/project-knowledge-plane-system-prompt-2026-05-29 --master-plan docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/00-master-plan-v1.md --status-file .claude/docs/phase-status.yaml --execution-root docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution --archive-label project-knowledge-plane-system-prompt-2026-05-29"
  readinessDecision: "prep_phase_required"
```

This package is not dispatch-ready until Phase 01 validates current dirty paths, active runtime pointers, and account-root state namespace assumptions. No live `.claude/**` or account-root `.codex/**` adoption is allowed before Phase 07.

## State Scope Invariants
| State Type | Scope Key | Default Location | Repo Mirror | Mutation Rule |
|------------|-----------|------------------|-------------|---------------|
| Project knowledge | `projectId` | `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge` | `.claude/cache/knowledge/summary.json` and closeout manifests only | Shared by all worktrees for the same logical project |
| Execution state | `projectId/worktreeId/branchId/runId` | `%USERPROFILE%/.codex/state/projects/<projectId>/execution/worktrees/<worktreeId>/branches/<branchId>/runs/<runId>` | phase status summary and evidence manifest only | Never merged into semantic knowledge without lifecycle verification |
| Raw evidence/logs | `projectId/runId` | account-root execution/evidence roots | digest, command list, and replay manifest only | Allowed outside repo; never prompt-inlined |
| Portable evidence | repo path + manifest id | project repo `docs/implementation/**` | authoritative for review/replay summary | Must be commit-safe and free of raw graph/log payload |
| Harness meta-knowledge | `moonshot-harness-core` | `%USERPROFILE%/.codex/state/projects/moonshot-harness-core/knowledge` | release and rollback manifests | Stable promotion requires review, replay, and rollback evidence |

## Pre-Adoption Staging Rule
- Phases 01-06 may only create or modify files under `docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-<NN>/**`.
- Live paths such as `.claude/scripts/**`, `.claude/schemas/**`, `.claude/skills/**`, `.codex/skills/**`, `.claude/workflow.registry.yaml`, and `.claude/verification.contract.yaml` are read-only before Phase 07.
- Pre-adoption verification commands must run against `HARNESS_OVERLAY_ROOT=docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-<NN>` or a cumulative overlay root, never against live files.
- Exception: existing live helper scripts may be invoked before Phase 07 only as read-only validators when they accept `--overlay-root` or `HARNESS_OVERLAY_ROOT`; they must not write outside the phase staging root and must not modify live `.claude/.codex` targets. If a helper cannot be proven read-only, copy or implement the validator inside the staging overlay.
- Phase 07 is the only phase that can copy staged artifacts to approved live targets, and it must produce dry-run, apply, rollback, parity, and no-delete/no-stage evidence.

## Affected Surface Inventory
| Surface | Current Role | Phase Decision | Required Evidence |
|---------|--------------|----------------|-------------------|
| `.claude/scripts/memorygraph-project-index.mjs` | Builds project-local seed with package/basename fallback | migrate/wrap resolver in Phase 01; no backend migration in early phases | fallback compatibility fixture |
| `memorygraph-direct.mjs` | Direct project-local MemoryGraph health/refresh | defer backend migration, consume project namespace env only after Phase 07 | health degraded/non-blocking fixture |
| `.claude/scripts/commit-moonshot-memory-refresh.mjs` | Commit-time MemoryGraph refresh; package/basename fallback | migrate/wrap resolver in Phase 01 and update skill docs in Phase 07 | no fallback bypass fixture |
| `.claude/scripts/commit-moonshot-promotion-audit.mjs` | AWTL promotion audit with project id option | update only if it derives default project id without resolver; otherwise defer with reason | defer table evidence |
| `.claude/scripts/lib/awtl-memory-promotion.mjs` | Promotion write helper with project id payload | update promotion contract in Phase 06; no prompt injection role | unsafe promotion rejection |
| `commit-moonshot` memory refresh (`SKILL.md` and `.ko.md`, `.claude`/`.codex`) | Commit-time project memory refresh | update docs in Phase 07 after builder contract exists | no memory artifacts staged by default |
| `project-memory-refresh` (`SKILL.md` and `.ko.md`, `.claude`/`.codex`) | Explicit project KG refresh | update docs in Phase 07; no automatic global promotion | project-local write contract |
| `session-logger` | Compact reusable fact logging | migrate to typed record contract after Phase 06 | raw transcript exclusion test |
| `doc-auto-sync` | Documentation update path may refresh MemoryGraph seed | update to seed-only typed project namespace; do not write semantic facts | seed-only no-write test |
| `.claude/agents/project-memory-agent.md` and `.ko.md` | Forked compact project memory recall | migrate to `Project Knowledge Context` builder contract | summary-only prompt test |
| `.claude/agents/project-memory-check.md` and `.ko.md` | Project memory gate/check agent | migrate to typed status and strict/advisory matrix | strict/degraded matrix test |
| `.claude/agents/project-memory-reviewer.md` and `.ko.md` | Reviews project memory outputs | update to typed record/provenance review | provenance review fixture |
| `.claude/agents/phase-attempt-agent.md` and `.ko.md` | Consumes `projectMemoryContext` before execution | migrate to `projectKnowledgeContext`; keep raw graph ban | phase attempt prompt fixture |
| `.codex/agents/project-memory-agent*` | Codex mirror of memory agent | mirror migrate with `.claude` source | mirror parity |
| `.codex/agents/project-memory-check*` | Codex mirror of memory check | mirror migrate | mirror parity |
| `.codex/agents/project-memory-reviewer*` | Codex mirror of memory reviewer | mirror migrate | mirror parity |
| `.codex/agents/phase-attempt-agent*` | Codex mirror of phase attempt agent | mirror migrate | mirror parity |
| `moonshot-plan-writer` memory intake | Planning stage reads compact memory context | update docs to use builder summary and typed omissions | planning prompt fixture |
| `moonshot-phase-executor` | Phase execution adapter | update prompt handoff in Phase 04 | Project Knowledge Context visible in delegated-terminal path |
| `moonshot-in-session-coordinator` | Forked attempt coordinator | update prompt handoff in Phase 04 | Project Knowledge Context visible in forked-agent path |
| `moonshot-phase-runner` | Public phase runner | update public contract in Phase 04/07 | boundary and mirror parity |
| `moonshot-orchestrator` | Bounded implementation entrypoint | update public contract in Phase 04/07 | prompt summary-only test |
| `product-orchestrator` | Product-definition entrypoint | update public contract in Phase 04/07 | docs-only degraded memory behavior |
| `harness-memory-promoter` | Global/harness promotion | update promotion manifest contract in Phase 06/07 | unsafe promotion rejection |

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Identity and Storage Contract | `01-identity-and-storage-contract.md` | - |
| 02 | Typed Knowledge Schema and Provenance | `02-typed-knowledge-schema-and-provenance.md` | 01 |
| 03 | Knowledge Context Builder | `03-knowledge-context-builder.md` | 01, 02 |
| 04 | Orchestrator Prompt Integration | `04-orchestrator-prompt-integration.md` | 03 |
| 05 | Ontology and Verifier Constraints | `05-ontology-and-verifier-constraints.md` | 02, 03 |
| 06 | Recursive Improvement Lifecycle | `06-recursive-improvement-lifecycle.md` | 02, 03, 05 |
| 07 | Adoption and Migration | `07-adoption-and-migration.md` | 01-06 |

## Execution Order Notes
- Phase 01 must run first because all later phases depend on stable `projectId`, account-root namespace resolution, and project-vs-worktree state boundaries.
- Phase 02 and Phase 03 are sequential because prompt summaries must be derived from typed, provenance-aware records.
- Phase 04 and Phase 05 may be reviewed in parallel after Phase 03 but must be finalized before Phase 06.
- Phase 07 is the only phase that may update live entrypoint skills, account-root sync guidance, or adoption materialization.

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-001 | AC-001 | User | Account-root harness covers multiple projects without centralizing project truth. | 01 | `01-identity-and-storage-contract.md` | mapped |
| REQ-002 | AC-002 | User | Knowledge state is project-scoped, not worktree-scoped. | 01 | `01-identity-and-storage-contract.md` | mapped |
| REQ-003 | AC-003 | User/research | Separate policy, semantic, episodic, ontology, provenance, and execution semantics. | 02 | `02-typed-knowledge-schema-and-provenance.md` | mapped |
| REQ-004 | AC-004 | User/research | System prompt receives compact summary only, never raw graph/log/transcript. | 03 | `03-knowledge-context-builder.md` | mapped |
| REQ-005 | AC-005 | User | `moonshot-phase-runner`, `moonshot-orchestrator`, and `product-orchestrator` use project knowledge context before attempts. | 04 | `04-orchestrator-prompt-integration.md` | mapped |
| REQ-006 | AC-006 | Research | Ontology constraints are executable verifier inputs, not prompt dumps. | 05 | `05-ontology-and-verifier-constraints.md` | mapped |
| REQ-007 | AC-007 | User | Project and harness recursive improvement lifecycle is supported. | 06 | `06-recursive-improvement-lifecycle.md` | mapped |
| REQ-008 | AC-008 | Harness contract | Live adoption occurs only after staged validation and mirror parity. | 07 | `07-adoption-and-migration.md` | mapped |
| REQ-009 | AC-016 | Reviewer | Existing memory-aware callsites must be inventoried and migrated, updated, or deferred explicitly. | 04, 07 | `04-orchestrator-prompt-integration.md`, `07-adoption-and-migration.md` | mapped |
| REQ-010 | AC-017 | Reviewer | Pre-adoption phases must prove they did not mutate live `.claude/.codex` targets. | 01-06 | phase docs | mapped |

## Unmapped Source Requirements
- None at draft time. Independent review must confirm whether research claims imply additional hard requirements around signed provenance, temporal point-in-time query, or promotion security.

## Phase Completion Checklist
- [x] Phase 01 - Identity and Storage Contract (`01-identity-and-storage-contract.md`)
- [x] Phase 02 - Typed Knowledge Schema and Provenance (`02-typed-knowledge-schema-and-provenance.md`)
- [x] Phase 03 - Knowledge Context Builder (`03-knowledge-context-builder.md`)
- [x] Phase 04 - Orchestrator Prompt Integration (`04-orchestrator-prompt-integration.md`)
- [x] Phase 05 - Ontology and Verifier Constraints (`05-ontology-and-verifier-constraints.md`)
- [x] Phase 06 - Recursive Improvement Lifecycle (`06-recursive-improvement-lifecycle.md`)
- [x] Phase 07 - Adoption and Migration (`07-adoption-and-migration.md`)

## Completion Rule
- Mark a phase checked only when its phase plan acceptance criteria pass with recorded evidence.
- Do not claim full completion while any phase is unchecked or while final git closeout is dirty.
- Do not use MemoryGraph/KG/ontology facts as enforcement proof unless a deterministic verifier consumes them and emits closeout evidence.
