# 01 Boundary Contract Guards v2

## Goal

Create the first guard layer for canonical source, installed profile, generated state, and archive specimen boundaries.

## Dependencies

None.

## Owned Paths

- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- new or existing active contract test files under `tests/`
- `package/package-contract.yaml`

## Work

- Add a structured active-reference scanner for `README.md`, `docs/public/**`, `agents/**`, and `skills/**`.
- Reject active references that treat `.claude/scripts`, `.claude/templates`, or `.claude/docs/guidelines` as canonical source.
- Reject active recommended/default execution commands under `archive/scripts/legacy-phase-adapters/**`.
- Reject personal absolute paths such as `/Users/dev/**`.
- Allow explicit exceptions only for installed/local profile entrypoints, compatibility notes, generated-state cleanup, and historical evidence snapshots.

## Acceptance Evidence

- Guard test fails before downstream cleanup when seeded with forbidden fixtures.
- Guard test passes after phases 2-7.
- The exception list is centralized and names the reason for each exception.

## Phase Boundary

This phase may introduce failing tests if run alone. Later phases must make those tests green without weakening the boundary rules.
