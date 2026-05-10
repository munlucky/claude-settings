# Ouroboros Harness Adoption Master Plan v1

> This document is the plan of all plans for absorbing selected Ouroboros harness mechanics into the Moonshot harness without replacing the existing phase-runner, WORKSETS, QA_REPORT, and verifier closeout model.

## Source Baseline

- User request in the Codex thread on 2026-05-10: "Ouroboros의 좋은점을 흡수하고 싶어" and the eight-phase absorption strategy (role: scope/priority).
- `docs/analysis/ouroboros-harness-adoption-inventory.md` (role: external pattern inventory and adoption effects).
- `.codex/skills/moonshot-plan-writer/SKILL.md` (role: plan package structure and phase-runner compatibility contract).
- `.claude/skills/moonshot-phase-runner/SKILL.md` (role: execution boundary and phase-runner behavior).
- `.claude/skills/moonshot-orchestrator/SKILL.md` (role: stable public entrypoint and runtime adapter policy).
- `.claude/skills/completion-verifier/SKILL.md` (role: completion and evidence gate policy).
- `.claude/verification.contract.yaml` (role: verification command and artifact contract).
- Current implementation surfaces: `.claude/schemas/analysis-context.schema.yaml`, `.claude/scripts/agent-loop-phase-plan-lib.mjs`, `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/lib/*`, `.claude/docs/guidelines/*`.

## Source Gaps And Decisions

- `docs/PRD-v2.md`, `docs/SPEC-v2.md`, and `docs/GDD.md` are absent for this internal harness improvement. The user request, local harness source, and the Ouroboros adoption inventory are the selected baseline.
- This package is not a full Ouroboros port. Full Python runtime, new `ooo` command surface, default multi-model consensus, MCP-only execution, and full ontology convergence are excluded.
- This package must not add a new public entrypoint unless a later implementation phase proves an existing owner would mix unrelated responsibilities.
- This turn creates planning documents only. It does not rewrite `.claude/docs/phase-status.yaml` or active workflow pointers because the current pointer references a completed `harness-closeout-consistency-2026-05-08` workstream.

## Objective

- Add Ouroboros-style pre-execution contract discipline to the Moonshot plan-writer and phase-runner flow.
- Preserve the current Moonshot strengths: phase-runner execution, atomic WORKSETS, QA_REPORT/SCORECARD/HANDOFF artifacts, strict verifier closeout, runtime parity, and stale-state guards.
- Make PRD/SPEC-driven work pass through Goal Contract normalization, ambiguity scoring, AC extraction, AC-linked worksets, event lineage, and trigger-based semantic evaluation before strong completion claims.

## Non-goals

- Do not replace `moonshot-plan-writer`, `moonshot-phase-runner`, `moonshot-orchestrator`, or `completion-verifier`.
- Do not weaken strict verification, freshness, runtime parity, or closeout rules.
- Do not treat skipped mechanical checks as pass in strict profiles.
- Do not make semantic or consensus review mandatory for all tasks.
- Do not write raw MemoryGraph or runtime-state changes as part of the plan package.

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Goal Contract Schema And Template | `close/01-goal-contract-schema-template-v1.md` | - |
| 02 | Plan Writer Ambiguity Gate And AC Extraction | `close/02-plan-writer-ambiguity-ac-extraction-v1.md` | 01 |
| 03 | AC-linked WORKSETS And Artifact Projection | `close/03-ac-linked-worksets-artifact-projection-v1.md` | 01, 02 |
| 04 | Completion Verifier Task-vs-AC Verdict Split | `close/04-completion-verifier-task-ac-verdict-split-v1.md` | 03 |
| 05 | Event Ledger And Replay Read Model | `close/05-event-ledger-replay-read-model-v1.md` | 01, 03, 04 |
| 06 | Evaluation Trigger Pipeline | `close/06-evaluation-trigger-pipeline-v1.md` | 04, 05 |
| 07 | Resilience Retry And Stop-reason Taxonomy | `close/07-resilience-retry-stop-reason-taxonomy-v1.md` | 05, 06 |
| 08 | Runtime Capability Status And Resume Model | `close/08-runtime-capability-status-resume-model-v1.md` | 05, 06, 07 |

## Execution Order Notes

- Phase 01 must run first because later ambiguity, AC, event, and verifier fields need a contract snapshot and schema anchor.
- Phase 02 belongs at the `PRD/SPEC -> plan-writer` boundary. It prevents ambiguous documents from becoming executable phase plans without explicit assumptions or blockers.
- Phase 03 upgrades WORKSETS after Goal Contract and AC extraction exist.
- Phase 04 makes closeout semantics consume the new workset structure and blocks the common mistake `task completed == AC passed`.
- Phase 05 adds event lineage after the core contract/workset/verdict shapes are stable.
- Phase 06 adds semantic/consensus triggers only after deterministic evidence and event context are available.
- Phase 07 consumes event and evaluation outcomes to classify non-progress loops.
- Phase 08 closes the adoption by exposing capability, status, resume, and TUI-readable projections.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | establishes shared schema/template vocabulary |
| wave-2 | 02 | sequential | mutates plan-writer policy and extraction path |
| wave-3 | 03 | sequential | changes WORKSETS contract consumed by runner and closeout |
| wave-4 | 04 | sequential | changes completion semantics; must follow WORKSETS shape |
| wave-5 | 05 | sequential | introduces durable event lineage across shared state surfaces |
| wave-6 | 06, 07 | conditional parallel | allowed only if Phase 06 stays in verifier/evaluation files and Phase 07 stays in failure/retry files |
| closeout | 08 | sequential | synchronizes runtime capability, status, resume, docs, and regression fixtures |

- Default execution should be sequential because this package touches shared harness control-plane files.
- Parallel execution is allowed only when `phase-wave-coordinator` proves disjoint `ownedPaths` and no shared mutable state writes.

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| OHA-001 | User strategy | Add Seed-lite / Goal Contract before SPRINT_CONTRACT | 01 | `close/01-goal-contract-schema-template-v1.md` | mapped |
| OHA-002 | User strategy | Add objective, scope, non-goals, constraints, AC, exit conditions, brownfield context, snapshot id, provenance | 01 | `close/01-goal-contract-schema-template-v1.md` | mapped |
| OHA-003 | User strategy | Add ambiguity and clarity scoring before implementation | 02 | `close/02-plan-writer-ambiguity-ac-extraction-v1.md` | mapped |
| OHA-004 | User strategy | Add unresolved questions and assumptions-ledger link | 02 | `close/02-plan-writer-ambiguity-ac-extraction-v1.md` | mapped |
| OHA-005 | User strategy | Upgrade WORKSETS to AC-linked work items | 03 | `close/03-ac-linked-worksets-artifact-projection-v1.md` | mapped |
| OHA-006 | User strategy | Enforce `taskStatus=completed != acVerdict=passed` | 04 | `close/04-completion-verifier-task-ac-verdict-split-v1.md` | mapped |
| OHA-007 | User strategy | Add event ledger or SQLite events for append-only lineage | 05 | `close/05-event-ledger-replay-read-model-v1.md` | mapped |
| OHA-008 | User strategy | Add mechanical -> semantic -> consensus trigger pipeline without silent skip-as-pass | 06 | `close/06-evaluation-trigger-pipeline-v1.md` | mapped |
| OHA-009 | User strategy | Add stagnation patterns, raw stop reason, recovery action, normalized verdict, per-iteration timeout | 07 | `close/07-resilience-retry-stop-reason-taxonomy-v1.md` | mapped |
| OHA-010 | User strategy | Add runtime capability matrix, deferred tool lookup, MCP unavailable classification, fallback policy | 08 | `close/08-runtime-capability-status-resume-model-v1.md` | mapped |
| OHA-011 | User strategy | Add compact status, event-backed progress, stale progress detection, resume brief, lineage ids | 08 | `close/08-runtime-capability-status-resume-model-v1.md` | mapped |
| OHA-012 | User strategy | Keep current public entrypoints stable | 01-08 | all phase files | mapped |
| OHA-013 | User strategy | Connect docs rules to schema, template, scripts, and verifier | 01-08 | all phase files | mapped |
| OHA-014 | Adoption inventory | Add contract change ledger, brownfield readiness, verification override allowlist, QA backend matrix, unstuck route, product-value check, execution-vs-evaluation guide, runtime doctor where appropriate | 01, 02, 06, 07, 08 | relevant phase files | mapped |

## Unmapped Source Requirements

- None. Excluded patterns are recorded as non-goals or direct rejections, not unmapped requirements.

## Phase Completion Checklist

- [x] Phase 01 - Goal Contract Schema And Template (`close/01-goal-contract-schema-template-v1.md`)
- [x] Phase 02 - Plan Writer Ambiguity Gate And AC Extraction (`close/02-plan-writer-ambiguity-ac-extraction-v1.md`)
- [x] Phase 03 - AC-linked WORKSETS And Artifact Projection (`close/03-ac-linked-worksets-artifact-projection-v1.md`)
- [x] Phase 04 - Completion Verifier Task-vs-AC Verdict Split (`close/04-completion-verifier-task-ac-verdict-split-v1.md`)
- [x] Phase 05 - Event Ledger And Replay Read Model (`close/05-event-ledger-replay-read-model-v1.md`)
- [x] Phase 06 - Evaluation Trigger Pipeline (`close/06-evaluation-trigger-pipeline-v1.md`)
- [x] Phase 07 - Resilience Retry And Stop-reason Taxonomy (`close/07-resilience-retry-stop-reason-taxonomy-v1.md`)
- [x] Phase 08 - Runtime Capability Status And Resume Model (`close/08-runtime-capability-status-resume-model-v1.md`)

## Completion Rule

- Mark a phase checked only when its schema/template/script/verifier changes are implemented and fresh evidence is recorded.
- Do not declare the package complete while any phase lacks exact verification commands or closeout evidence.
- Do not treat this plan package as runnable until `prepare-implementation-plan-state.mjs --dry-run` confirms the selected master plan, phase list, execution root, and active pointer rewrite.
- Do not start phase-runner while existing workflow-enforcement pointers still reference another active or stale workstream.
