# Phase 04 - Context State Engine, Compaction, and Prompt Assembly v2

## Goal

Make long-running work resume from a compact runtime state object instead of chat transcript continuity.

## Execution Metadata

- Dependencies: Phase 02, Phase 03.
- Owned paths: `scripts/context-state.mjs`, `scripts/knowledge-context-build.mjs`, `scripts/lib/context-state-engine.mjs`, `scripts/lib/runtime-state-store.mjs`, `schemas/verification.contract.yaml`, planned `schemas/context-pack.schema.json`, `skills/product-orchestrator/**`, `skills/moonshot-orchestrator/**`, `skills/moonshot-phase-runner/**`, `skills/moonshot-in-session-coordinator/**`, `skills/moonshot-phase-executor/**`, `agents/project-memory-agent.*.md`, `agents/phase-attempt-agent.*.md`, `docs/public/guidelines/resumable-session-layer.md`, `docs/public/guidelines/session-compaction.md`, `docs/public/guidelines/token-optimization.md`, `tests/runtime-read-model-contract.test.mjs`, `tests/context-state-engine-contract.test.mjs`, planned `tests/knowledge-context-build-contract.test.mjs`, planned `tests/context-pack-contract.test.mjs`.
- Read-only paths: chat transcripts, generated logs, runtime DBs outside test/temp state, profile-local rules.
- Adoption targets: source read model and package support scripts.
- Live mutation policy: no live profile mutation; context snapshots write only through runtime-state APIs.
- Required evidence: forced restart fixture, stale projection fixture, compaction ratio fixture, prompt stable-prefix fixture, `npm test`.
- Conflicts: chat transcript as authority, hand-written resume briefs that bypass DB read model, stale projections that can accept completion.
- Staged paths: context engine scripts, verification contract, public context/token docs, context tests.
- Closure traceability: forced-restart output, compacted state JSON, prompt assembly metric output.
- Package handoff: Phase 11 must confirm any new `context-pack` schema/support script is included when source-owned and that generated context packs remain excluded from package payloads.

## Required Work

- Define context state schema for objective, phase, current blocker, lineage, assumptions, evidence, changed files, open risks, and next action.
- Implement context builder, compactor, and rehydrator commands.
- Define `ContextPackV1` as an additive structured source object under `projectKnowledgeContext.contextPack`; do not replace the existing prompt-facing `projectKnowledgeContext.promptBlock` contract.
- Preserve existing top-level `projectKnowledgeContext` compatibility fields: `schemaVersion`, `projectId`, `namespace`, `knowledgeRevision`, `status`, `strictness`, `stage`, `policyAnchors`, `semanticFacts`, `graphSynopsis`, `ontologyConstraints`, `staleOrUnavailable`, `omittedByPolicy`, and `promptBlock`.
- Add only compatibility-safe metadata such as `metadata.contextPackRef`, `metadata.packId`, `metadata.contextPackSchemaVersion`, and `metadata.tokenEstimate`; keep `contextPackRef` a deterministic lineage id, not a file path.
- Keep `status` vocabulary stable. Do not add `blocked`; derive blocking from `staleOrUnavailable[].blocking` or compatibility metadata.
- Keep `strictness` as the public serving authority. If `servingMode` exists, it is metadata-only or derived from `strictness`.
- Make `runtimeAuthorityRef` stage-conditional so intake/plan stages without active `runId`/`goalId` can still build context safely.
- Split stable prompt prefix from volatile execution tail.
- Track stale warnings and projection freshness.
- Add prompt cache hit and context compaction metrics.
- Update `resumable-session-layer.md`, `session-compaction.md`, and `token-optimization.md` to make DB read model primary.

## Acceptance Criteria

- A forced restart can resume from DB/read model without reading the full chat log.
- Stale projections are visible and cannot cleanly complete.
- Prompt assembly keeps stable tool/policy prefix before dynamic state.
- Compaction tests cover large event histories and lossless next-action reconstruction.
- Existing consumers pass when `projectKnowledgeContext.contextPack` is absent or ignored because `promptBlock` and existing summary fields remain stable.
- Raw MemoryGraph/KG/ontology records, transcripts, logs, and secret-like strings are not copied into `promptBlock`, plans, QA reports, or handoff documents.

## Regression Contract

- Large event history compacts without losing next action, blocker, lineage, assumptions, evidence, or changed-file state.
- Rehydration reconstructs a runnable phase brief from DB/read model.
- Stale projection warnings block clean completion.
- Prompt assembly keeps stable prefix before volatile tail and records cache metrics.
- `ContextPackV1` is additive-only and cannot rename `semanticFacts` to `verifiedFacts` at the `projectKnowledgeContext` top level.
- Candidate memory cannot render as `semanticFacts` or prompt-facing verified facts.

## Completion Evidence

- `npm test`
- Forced-restart/resume fixture
- Compaction ratio fixture
- Prompt prefix/cache metric fixture
- Context pack compatibility fixture for both context-pack-present and context-pack-absent paths
