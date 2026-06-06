# Phase 02 - Runtime Control Plane Foundation v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Implement the authoritative runtime state database, store API, and CLI foundation for events, completion decisions, resume snapshots, tool calls, and eval results.

## Owned Paths

- `package.json`
- `package-lock.json`
- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `scripts/lib/runtime-state-db-path.mjs`
- `package/build-package.mjs`
- `package/package-contract.yaml`
- `tests/runtime-control-plane-contract.test.mjs`
- `tests/package-materialization.test.mjs`

## Read-Only Paths

- `.moonshot-relay/**`
- `.moonshot-state/**`
- `.claude/**`
- `.codex/**`
- account-root homes except explicit temp homes used by installer smoke tests
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files

## Dependencies

- Phase 01 complete.

## Implementation Work

- Add `better-sqlite3` as a runtime dependency and commit the generated lockfile only after validating the native dependency delivery path.
- Define supported native dependency targets:
  - `windows-latest`
  - `ubuntu-latest`
  - `macos-latest`
  - supported Node versions from the repository engine policy
- Document the rejected fallback decision if an adapter/fallback SQLite driver is not used.
- Prove package/account-root runtime dependency availability:
  - source `npm ci`
  - package dry-run includes dependency metadata or runtime support install plan
  - installer dry-run uses temp `--moonshot-home`, `--claude-home`, and `--codex-home`
  - account-root runtime-state smoke either succeeds or returns a typed degraded status
- Keep DB path authority in `resolveDbPath()` only.
- Implement `initRuntimeState()` with idempotent schema migrations.
- Apply SQLite `journal_mode=WAL` and `busy_timeout=5000`.
- Implement schema v1 with identity and ordering tables:
  - `runs`
  - `goals`
  - `runtime_events`
  - `completion_decisions`
  - `resume_snapshots`
  - `tool_calls`
  - `eval_results`
- Add sequence, status CHECK constraints, supersede/revoke columns, evidence hash, writer identity, and lookup indexes.
- Implement append/read helpers for:
  - runtime events
  - completion decisions
  - resume snapshots
  - tool calls
  - eval results
- Implement typed degraded statuses for:
  - missing native module
  - schema mismatch
  - DB lock timeout
  - unresolved DB path
- Implement `scripts/runtime-state.mjs` CLI commands:
  - `init`
  - `record-event`
  - `record-completion`
  - `assess-completion`
  - `snapshot-resume`
  - `status`
- Add package materialization entries for the new source scripts.
- Preserve generated-state exclusions for `runtime-state.sqlite`, WAL, and SHM files.
- Add new runtime-control-plane tests to the active `npm test` script.
- Extend `tests/package-layout.test.mjs` so the active gate fails if modernization contract tests are omitted from `npm test`.

## Acceptance Criteria

- `node scripts/runtime-state.mjs init --json` creates the DB under `resolveDbPath()`.
- Running init twice does not duplicate migrations or fail.
- CLI JSON outputs include durable IDs and resolved DB path.
- Package dry-run includes source scripts but not generated DB files.
- Native dependency behavior is proven in source and temp account-root contexts, or runtime-state support returns a typed degraded status without claiming authority.
- Concurrent writers do not corrupt sequence ordering or latest-decision lookup.

## Regression Contract

Add `tests/runtime-control-plane-contract.test.mjs` before production implementation.

Required test cases:

- DB migration is idempotent.
- WAL and busy timeout are configured.
- DB path comes from `resolveDbPath()`.
- Generated DB/WAL/SHM are not package payload entries.
- CLI returns parseable JSON for all commands.
- Missing native dependency returns typed degraded status.
- Concurrent writes preserve monotonic event/decision ordering.
- New modernization tests are included in `npm test`.

## Completion Evidence

- `node --test tests/runtime-control-plane-contract.test.mjs`
- `npm test`
- `npm run test:package`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json --moonshot-home <temp> --claude-home <temp> --codex-home <temp>`
