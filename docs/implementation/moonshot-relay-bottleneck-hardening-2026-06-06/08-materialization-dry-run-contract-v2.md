# 08 Materialization Dry-Run Contract v2

## Goal

Make package materialization dry-run a trustworthy copy-plan signal.

## Dependencies

- Phase 1 guard rules.
- Phase 4 package/reference contract.

## Owned Paths

- `package/build-package.mjs`
- `package/package-contract.yaml`
- `tests/package-materialization.test.mjs`
- `tests/package-layout.test.mjs`

## Work

- Change `package/build-package.mjs --dry-run --json` so it computes the same planned copy set as a clean materialization run without writing files.
- Return a clearly named `planned[]` field in dry-run JSON. Keep `copied[]`/`copiedCount` reserved for actual write operations or explicitly document them as compatibility aliases.
- Add a test comparing dry-run planned path sets with clean materialization planned path sets for equivalent runtime inputs.
- Ensure generated state, logs, caches, traces, and local profiles stay excluded.

## Acceptance Evidence

- `node package/build-package.mjs --runtime all --dry-run --json` reports non-empty `planned[]` paths when payload exists.
- Dry-run and clean planned path sets match after normalizing write effects.
- `npm run test:package` passes.

## Phase Boundary

Do not make dry-run write files just to reuse the clean materialization path.
