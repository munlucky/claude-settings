# Phase 06 - Workflow Skill Integration v1

## Objective

Integrate knowledge contract binding into Moonshot architecture, planning, orchestration, and phase execution skill contracts without expanding profile-local public skill discovery.

## Dependencies

- Phase 04.
- Phase 05.

## Owned Paths

- `scripts/architecture-context-build.mjs`
- `skills/architecture-gate-reviewer/SKILL.md`
- `skills/architecture-gate-reviewer/SKILL.ko.md`
- `skills/moonshot-plan-writer/SKILL.md`
- `skills/moonshot-plan-writer/SKILL.ko.md`
- `skills/moonshot-orchestrator/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.ko.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `skills/moonshot-phase-runner/SKILL.ko.md`
- `tests/workflow-e2e-contract.test.mjs`
- `tests/moonshot-architecture-handoff-contract.test.mjs`

## Read-only Paths

- `package/runtime-surface.json`
- `docs/public/runtime-control-plane.md`
- `schemas/verification.contract.yaml`
- `rules/workflow-bundles.yaml`

## Staged Paths

- Generated execution artifacts under this package's `execution/` root when run by phase-runner.

## Adoption Targets

- Source checkout and package contract only. No live account-root adoption in this phase.

## Live Mutation Policy

Do not mutate live `.claude`, `.codex`, `.moonshot-relay`, or account-root homes. Do not add a new public runtime skill.

## Acceptance Criteria

- `architecture-context-build.mjs` surfaces next-step command references for resolver, binder, and handoff builder without doing full binding itself.
- `architecture-gate-reviewer` hard-stops architecture-heavy handoff when contract slice or handoff is missing, blocked, or missing verification signals.
- `moonshot-plan-writer` carries architecture package path, handoff path, constraints, verification signals, owned/read-only/staged paths, and blocking preconditions into phase metadata.
- `moonshot-orchestrator` consumes only `ARCHITECTURE_HANDOFF.promptBlock` and metadata, not raw knowledge.
- `moonshot-phase-runner` accepts phase metadata with required architecture handoff, blocks dispatch when handoff is blocked, and records selected verification signals in phase evidence.
- Attempts record compact refs such as `architectureHandoffRef`, selected decision IDs, selected constraint IDs, verification signal IDs, and status.
- Public profile-local skill discovery remains unchanged; verify `package/runtime-surface.json` `publicRuntimeSkills` before and after this phase.

## Verification Signals

- `node --test tests/workflow-e2e-contract.test.mjs tests/moonshot-architecture-handoff-contract.test.mjs`
- Negative test: blocked handoff cannot be marked execution-ready.
- Negative test: raw KG/ontology payload is not copied into skill prompt guidance.
- Runtime-surface invariant check: no change to `package/runtime-surface.json` `publicRuntimeSkills`.

## Handoff Notes

This phase changes skill contracts and workflow behavior only. Runtime public skill allowlist must remain unchanged.
