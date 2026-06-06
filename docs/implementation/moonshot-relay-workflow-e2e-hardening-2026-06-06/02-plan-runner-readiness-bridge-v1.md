# Phase 02 - Plan Runner Readiness Bridge

## Goal

Close the gap between a completed plan package and a phase-runner-ready execution state.

## Scope

- `skills/moonshot-plan-writer/**`
- `skills/moonshot-phase-runner/**`
- `skills/moonshot-phase-executor/**`
- `skills/moonshot-in-session-coordinator/**`
- `templates/execution/**`
- optional new active script under `scripts/`
- tests

## Tasks

1. Decide and implement one active readiness bridge:
   - preferred: `scripts/prepare-phase-runner-state.mjs --dry-run --json`;
   - acceptable fallback: explicit manual readiness contract that does not claim an installed deterministic entrypoint exists.
2. Make plan templates `{planRoot}`-based.
3. Keep phase/demo artifacts package-local.
4. Add stale baseline and ambiguous multi-plan detection.
5. Reconcile Codex fork/subagent execution mapping and fallback rules.
6. Add registry/routing support for phase-plan detected workflows.

## Acceptance

- A synthetic plan package can be resolved and classified as `ready`, `docs_only`, `ambiguous`, or `blocked` by a machine-readable check.
- No active template points at a non-existent installed plan-state preparation command.
- `moonshot-phase-runner` cannot auto-select a stale plan package without warning/blocking metadata.
