# Phase 04 - Context State Engine, Compaction, and Prompt Assembly v2

## Goal

Make long-running work resume from a compact runtime state object instead of chat transcript continuity.

## Execution Metadata

- Dependencies: Phase 02, Phase 03.
- Owned paths: `scripts/context-state.mjs`, `scripts/lib/context-state-engine.mjs`, `scripts/lib/runtime-state-store.mjs`, `schemas/verification.contract.yaml`, `docs/public/guidelines/resumable-session-layer.md`, `docs/public/guidelines/session-compaction.md`, `docs/public/guidelines/token-optimization.md`, `tests/runtime-read-model-contract.test.mjs`, `tests/context-state-engine-contract.test.mjs`.
- Read-only paths: chat transcripts, generated logs, runtime DBs outside test/temp state, profile-local rules.
- Adoption targets: source read model and package support scripts.
- Live mutation policy: no live profile mutation; context snapshots write only through runtime-state APIs.
- Required evidence: forced restart fixture, stale projection fixture, compaction ratio fixture, prompt stable-prefix fixture, `npm test`.
- Conflicts: chat transcript as authority, hand-written resume briefs that bypass DB read model, stale projections that can accept completion.
- Staged paths: context engine scripts, verification contract, public context/token docs, context tests.
- Closure traceability: forced-restart output, compacted state JSON, prompt assembly metric output.

## Required Work

- Define context state schema for objective, phase, current blocker, lineage, assumptions, evidence, changed files, open risks, and next action.
- Implement context builder, compactor, and rehydrator commands.
- Split stable prompt prefix from volatile execution tail.
- Track stale warnings and projection freshness.
- Add prompt cache hit and context compaction metrics.
- Update `resumable-session-layer.md`, `session-compaction.md`, and `token-optimization.md` to make DB read model primary.

## Acceptance Criteria

- A forced restart can resume from DB/read model without reading the full chat log.
- Stale projections are visible and cannot cleanly complete.
- Prompt assembly keeps stable tool/policy prefix before dynamic state.
- Compaction tests cover large event histories and lossless next-action reconstruction.

## Regression Contract

- Large event history compacts without losing next action, blocker, lineage, assumptions, evidence, or changed-file state.
- Rehydration reconstructs a runnable phase brief from DB/read model.
- Stale projection warnings block clean completion.
- Prompt assembly keeps stable prefix before volatile tail and records cache metrics.

## Completion Evidence

- `npm test`
- Forced-restart/resume fixture
- Compaction ratio fixture
- Prompt prefix/cache metric fixture
