# Phase 04 - Architecture Handoff Builder v1

## Objective

Add `scripts/architecture-handoff-build.mjs` to convert an `ArchitectureContractSlice` into compact `ARCHITECTURE_HANDOFF.json` and `promptBlock` content for execution tools.

## Dependencies

- Phase 03.

## Owned Paths

- `scripts/architecture-handoff-build.mjs`
- `tests/architecture-handoff-build.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/handoff/`

## Read-only Paths

- `skills/moonshot-architecture/SKILL.md`
- `skills/moonshot-plan-writer/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `schemas/architecture/architecture-handoff.schema.json`

## Staged Paths

- `schemas/architecture/architecture-handoff.schema.json`

## Adoption Targets

- Source checkout only.

## Live Mutation Policy

No runtime profile mutation. Generated `ARCHITECTURE_HANDOFF.json` artifacts must be written only to the phase execution root or explicit test fixture paths unless a later phase explicitly owns another target path.

## Acceptance Criteria

- CLI accepts `--contract-slice`, optional output path, and `--json`.
- Output artifact is `ARCHITECTURE_HANDOFF`.
- Handoff records `sourceContractRef`, `handoffTarget`, `status`, `blocking`, `promptBlock`, selected decision IDs, selected constraint IDs, verification signal IDs, owned paths, read-only paths, and read-before-retry references.
- Target recommendation chooses bounded `moonshot-orchestrator` for narrow changes and `moonshot-phase-runner` for staged/multi-phase changes.
- Blocked contract slice yields blocked handoff and cannot be treated as execution-ready.
- Prompt block includes selected decisions, constraints, path boundaries, and verification signals, but no raw payload.

## Verification Signals

- `node --test tests/architecture-handoff-build.test.mjs`
- Workflow negative fixture proving blocked handoff is not dispatchable.

## Handoff Notes

This phase creates the runtime-facing bridge but does not yet update orchestrator or phase-runner skill contracts. That integration is Phase 06.
