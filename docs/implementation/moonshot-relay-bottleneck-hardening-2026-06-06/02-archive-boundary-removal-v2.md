# 02 Archive Boundary Removal v2

## Goal

Remove active dependency on archive internals while preserving archive files as specimens.

## Dependencies

- Phase 1 guard rules.

## Owned Paths

- `tests/migration-audit.test.mjs`
- `tests/harness-regression-contract.test.mjs`
- `scripts/lib/**`
- `tests/fixtures/**`
- `skills/moonshot-relay-maintainer/SKILL.md`

## Read-Only Paths

- `archive/**`

## Work

- Promote any still-needed helper logic from archive into active `scripts/lib/**`, or replace the dependency with minimal fixtures.
- Stop active tests from importing or executing `archive/scripts/legacy-phase-adapters/**`.
- Move archive verifier commands in maintainer docs from default/recommended checks to explicit legacy investigation notes.
- Keep archive filenames and contents stable unless a later compatibility-maintenance task explicitly owns them.

## Acceptance Evidence

- `rg -n "from ['\\\"]\\.\\./archive|archive/scripts/legacy-phase-adapters" tests skills agents README.md docs/public` has no active default-flow violations.
- `npm test` passes.
- Archive files remain excluded from package default discovery.

## Phase Boundary

Do not solve missing archive modules by restoring deleted legacy libraries under `archive/**`. The fix is to decouple active surfaces from archive internals.
