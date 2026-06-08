# Moonshot Architecture Guideline

`moonshot-architecture` is the architecture design stage between product definition and implementation execution.

Use it when a PRD, existing repository, or harness-improvement objective needs architectural decisions before `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner` can execute safely.

Required outputs for non-trivial work include requirement inventory, ASR catalog, quality attribute scenarios, architecture options, trade-off analysis, ADRs, C4 views when boundaries matter, and a traceability matrix.

Brownfield work must recover current architecture from repository evidence before proposing new boundaries.

Build phase prompts with `scripts/architecture-context-build.mjs`. The prompt-facing authority is `architectureContext.promptBlock`; project knowledge may be attached only as `projectKnowledgeContext.promptBlock` plus status metadata.

If the project knowledge namespace is unavailable in advisory mode, keep the architecture context status degraded and continue with explicit evidence. Do not silently invent missing current-state facts.

Architecture packages must not include raw MemoryGraph records, KG dumps, ontology dumps, runtime logs, transcripts, browser scrapes, or secret-like strings.

Do not mutate live `.claude/**`, `.codex/**`, account-root state, or runtime profiles during architecture design. Controlled adoption belongs to an explicit execution phase.

## Handoff Contract

Architecture packages hand off by path, not by copied document bodies. Downstream workflows consume:

- `TRACEABILITY_MATRIX.md`
- selected `ADR/*.md`
- `ARCHITECTURE_REVIEW.md`
- `PLAN.md` with task owners and verification signals
- Brownfield `CURRENT_ARCHITECTURE.md`, `PRD_FIT_GAP.md`, `IMPACT_MAP.md`, and `SPEC_DELTA.md` when existing-system evidence matters

`product-orchestrator` routes architecture-heavy PRDs here before implementation planning. `moonshot-plan-writer` maps accepted package rows into phase metadata. `moonshot-orchestrator` may execute a bounded selected ADR and traceability slice. `moonshot-phase-runner` owns multi-phase, staged adoption, and long-running architecture-derived plans.
