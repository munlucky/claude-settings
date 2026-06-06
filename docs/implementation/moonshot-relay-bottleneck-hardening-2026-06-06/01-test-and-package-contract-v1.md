# 01 Test And Package Contract v1

## Goal

Make `npm test` the authoritative active gate without changing preserved archive tests.

## Owned Paths

- `package.json`
- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `README.md`

## Work

- Add explicit npm scripts for active and package tests.
- Add a guard that rejects bare `node --test`, archive paths, and profile-local script paths in package scripts.
- Keep `archive/scripts/legacy-phase-adapters/**` filenames unchanged.
- Include `rules/` in the account-root common payload so the workflow bundle registry is installed under `MOONSHOT_RELAY_HOME`.

## Acceptance

- `npm test` exits 0.
- `npm run test:package` exits 0.
- `node --test tests/*.mjs` exits 0.
- Archive tests remain preserved and are not part of the default gate.
