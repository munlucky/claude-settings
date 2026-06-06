# Phase 02 - Runtime Control Plane Dependency and State Authority v2

## Goal

Make runtime-state authority production-grade across source, package, account-root, temp install, and CI matrix.

## Execution Metadata

- Dependencies: Phase 01.
- Owned paths: `package.json`, `package-lock.json`, `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs`, `scripts/lib/runtime-state-db-path.mjs`, `package/build-package.mjs`, `package/package-contract.yaml`, `tests/runtime-control-plane-contract.test.mjs`, `tests/completion-authority-contract.test.mjs`, `tests/runtime-read-model-contract.test.mjs`, `tests/package-materialization.test.mjs`.
- Read-only paths: generated runtime DB/WAL/SHM files, live account-root homes except explicit temp-home smoke targets.
- Adoption targets: source, package materialization, temp-home installer smoke, CI matrix.
- Live mutation policy: live account-root mutation is forbidden; temp homes only.
- Required evidence: `npm test`, `npm run test:package`, package dry-run, temp-home installer dry-run, runtime-state smoke, OS/Node matrix or documented pending operational gate.
- Conflicts: alternate DB path authority, manual accepted completion writers without repair approval, package payload containing runtime DB files, installed runtime claiming authority while degraded.
- Staged paths: runtime CLI/store, package contract/materializer, dependency files, runtime/completion/read-model tests.
- Closure traceability: runtime smoke output, package dry-run JSON, temp-home installer JSON, CI matrix or rollout blocker record.

## Required Work

- Keep `resolveDbPath()` as the only DB path authority.
- Maintain SQLite WAL, `busy_timeout=5000`, idempotent migrations, sequence ordering, evidence hash, writer identity, and degraded statuses.
- Prove `better-sqlite3` availability in source and packaged support roots, or make typed degraded state explicitly block authority claims.
- Add OS/Node matrix evidence for supported native dependency targets.
- Restrict accepted completion writers to authority assessment paths with identity and evidence validation.
- Preserve derived artifacts as projections with `authoritySource`, `decisionId`, `evidenceHash`, and stale metadata.

## Acceptance Criteria

- Source runtime-state smoke passes.
- Temp account-root runtime-state smoke passes for rollout success.
- Typed degraded status is accepted only as negative-path evidence and a carry-forward rollout blocker; it cannot be used to claim installed runtime availability.
- Package payload includes support scripts and excludes `runtime-state.sqlite*`.
- Completion false-positive fixtures remain rejected.

## Regression Contract

- DB migration remains idempotent.
- WAL and busy timeout are configured.
- DB path authority comes only from `resolveDbPath()`.
- Missing native dependency returns typed degraded status and cannot accept completion.
- Source, package, and temp-home smoke tests distinguish success from degraded negative-path evidence.
- Completion false-positive, stale verdict, missing identity, and unauthorized accepted writer fixtures remain rejected.

## Completion Evidence

- `npm test`
- `npm run test:package`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json --moonshot-home <temp> --claude-home <temp> --codex-home <temp>`
- Runtime-state source smoke output
- Installed runtime availability or explicit carry-forward rollout blocker
