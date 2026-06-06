# Phase 04 - Context State Engine and Prompt Assembly v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Make long-running harness work resumable from structured runtime state instead of chat replay, while preserving compact prompt boundaries and prompt-cache-friendly stable prefixes.

## Owned Paths

- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `scripts/prepare-phase-runner-state.mjs`
- `docs/public/guidelines/resumable-session-layer.md`
- `docs/public/guidelines/session-compaction.md`
- `docs/public/guidelines/token-optimization.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`
- `tests/runtime-read-model-contract.test.mjs`

## Read-Only / Preserved Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- account-root homes
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files except temp fixture data created by this phase's tests

## Dependencies

- Phase 02 complete.
- Phase 03 complete.

## Implementation Work

- Implement `recordResumeSnapshot()` and `buildRuntimeStatusReadModel()`.
- Wire `prepare-phase-runner-state.mjs`:
  - dry-run remains non-mutating
  - non-dry-run writes phase status, readiness JSON, and resume snapshot
- Define compact status semantics:
  - active contract
  - latest verdict
  - current blocker
  - lineage
  - stale warnings
- Define resume brief semantics:
  - next action
  - current blocker
  - lineage
- Return typed degraded read-model values for:
  - empty DB
  - schema mismatch
  - DB lock timeout
  - missing native module
  - stale projection artifacts
- Update guidelines to prefer runtime read model over raw chat replay.
- Update prompt assembly guidance:
  - stable static policy first
  - compact dynamic runtime state second
  - raw logs/transcripts never copied into prompts unless required to reproduce a failure

## Acceptance Criteria

- `scripts/runtime-state.mjs status --json` returns every required read-model field from `schemas/verification.contract.yaml`.
- `prepare-phase-runner-state.mjs --dry-run --json` does not create DB, phase status, or readiness files.
- Non-dry-run preparation records a resume snapshot.
- Documentation clearly separates compaction, rehydration, runtime state, and durable memory.
- Status output includes lineage, stale warnings, and typed degraded status even when runtime-state support is unavailable.

## Regression Contract

Add `tests/runtime-read-model-contract.test.mjs`.

Required test cases:

- Required read model fields are present.
- Empty DB status still returns typed degraded/default fields.
- Missing native dependency and DB lock timeout produce typed degraded/default fields.
- Resume snapshot appears after non-dry-run phase preparation.
- Dry-run writes nothing.

## Completion Evidence

- `node --test tests/runtime-read-model-contract.test.mjs`
- `npm test`
- `node scripts/prepare-phase-runner-state.mjs --dry-run --json ...` with a temp fixture package
