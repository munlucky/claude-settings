---
name: moonshot-architecture
description: Convert a PRD or existing codebase objective into an evidence-grounded architecture design package before implementation planning.
layer: orchestrator
loads:
  - architecture-design-artifacts
  - project-knowledge-context
  - requirements-traceability
  - verdict-summaries
deepReferences:
  - references/architecture-design-contract.md
  - references/context-safety.md
  - references/handoff-boundaries.md
outputArtifacts:
  - ARCHITECTURE_BRIEF.md
  - ASR_CATALOG.md
  - DOMAIN_MODEL.md
  - ARCHITECTURE_OPTIONS.md
  - TRADEOFF_ANALYSIS.md
  - C4/*.md
  - ADR/*.md
  - ARCHITECTURE_REVIEW.md
  - SPEC.md
  - SPEC_DELTA.md
  - PLAN.md
  - TRACEABILITY_MATRIX.md
triggers:
  - "moonshot architecture"
  - "PRD to architecture"
  - "architecture design"
  - "architecture recovery"
  - "architecture fit gap"
---

# Moonshot Architecture

## Role

Create an evidence-grounded architecture design package between product definition and implementation execution.

Use this skill when a request needs architectural reasoning before `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner` can safely execute implementation work.

## Modes

- `greenfield_prd`: start from a PRD and produce architecture decisions before implementation planning.
- `brownfield_codebase`: recover the current architecture from repository evidence, then produce fit-gap and migration guidance.
- `hybrid_prd_plus_existing_repo`: combine PRD normalization with Brownfield constraints and produce `SPEC_DELTA`.
- `meta_harness_design`: design Moonshot Relay harness changes and hand them off to `moonshot-plan-writer`.

## Flow

1. Classify the mode.
2. Build `projectKnowledgeContext` with the current stage and preserve status-only metadata.
3. Inspect project-local `knowledgeAnchors` declared in the target root `AGENTS.md`, if present. Select only anchors whose `mustConsultFor`/keywords match the current architecture scope, then read the smallest referenced agreement documents needed for evidence.
4. Build compact architecture context through `scripts/architecture-context-build.mjs` when available.
5. Normalize requirements into `REQUIREMENT_INVENTORY.md`.
6. Extract ASRs and quality attribute scenarios.
7. Build domain model, capability map, and data/integration flow.
8. For Brownfield/Hybrid work, recover current architecture and existing constraints from repository evidence.
9. Generate at least two architecture options for non-trivial work.
10. Run trade-off review.
11. Write C4 model and ADRs for significant decisions.
12. Produce `SPEC.md` or `SPEC_DELTA.md`.
13. Produce `PLAN.md` and `TRACEABILITY_MATRIX.md`.
14. Run `architecture-gate-reviewer` and write `ARCHITECTURE_REVIEW.md`.
15. Hand off to `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner` with explicit owned/read-only/staged paths and verification signals.

## Internal Stage Owners

`moonshot-architecture` coordinates these source-only internal skills. They remain out of profile-local public runtime discovery unless a later controlled adoption phase changes the runtime surface.

| Stage | Internal Skill | Primary Artifacts |
|---|---|---|
| ASR extraction | `asr-extractor` | `ASR_CATALOG.md`, `QUALITY_ATTRIBUTE_SCENARIOS.md` |
| Option generation | `architecture-option-generator` | `ARCHITECTURE_OPTIONS.md`, `CAPABILITY_MAP.md` |
| Trade-off review | `architecture-tradeoff-reviewer` | `TRADEOFF_ANALYSIS.md`, ADR inputs |
| C4 and ADR writing | `adr-c4-writer` | `C4/*.md`, `ADR/*.md` |
| Architecture gate review | `architecture-gate-reviewer` | `ARCHITECTURE_REVIEW.md`, handoff readiness |
| Brownfield recovery | `codebase-architecture-recovery` | `CURRENT_ARCHITECTURE.md`, `PRD_FIT_GAP.md`, `IMPACT_MAP.md`, `SPEC_DELTA.md` |

## Hard Stops

- Do not skip ASR extraction for non-trivial PRDs.
- In `greenfield_prd` mode, do not require Brownfield current-architecture evidence.
- Do not claim architecture readiness without ADRs for significant decisions.
- Do not produce a Greenfield implementation `PLAN.md` unless every accepted requirement maps to a quality scenario, ASR, ADR, task owner, and verification signal.
- Do not hand off to implementation without traceability from accepted requirements to owners and verification signals.
- Do not hand off to implementation without `architecture-gate-reviewer` readiness evidence.
- Do not invent Brownfield current architecture without repository evidence.
- Do not inline raw MemoryGraph records, KG edge dumps, ontology dumps, runtime logs, transcripts, browser scrapes, or secret-like strings.
- Do not mutate live `.claude/**`, `.codex/**`, account-root state, or runtime profiles during architecture design.
- Do not replace `moonshot-phase-runner` completion authority or `scripts/runtime-state.mjs assess-completion`.

## Required Evidence

- Mode classification and input source path.
- Architecture package path.
- Project-local knowledge anchor disposition: consulted anchor IDs, consumed agreement paths, and skipped-anchor rationale when anchors were present.
- Requirement inventory and ASR catalog.
- Domain/capability model or Brownfield current architecture evidence.
- Option comparison and trade-off review.
- ADR/C4 outputs for significant decisions.
- Architecture gate review status.
- Traceability matrix linking requirement IDs to implementation owners and verification signals.
- Handoff target and rationale.

## Public Surface Boundary

`moonshot-architecture` is a public runtime entrypoint. Supporting skills for ASR extraction, option generation, trade-off review, C4/ADR writing, gate review, and Brownfield recovery remain internal source skills unless a later controlled adoption phase explicitly changes the runtime surface.

Public guidelines mirror the durable policy under `docs/public/guidelines/`. Executable `deepReferences` stay local to this skill directory so package materialization can resolve them without profile-local public guideline paths.
