# Phase 11 - Packaging, Account-Root, Native Dependency, and Downstream Rollout v2

## Goal

Prove that packaged and installed runtime behavior matches source behavior without corrupting user state.

## Execution Metadata

- Dependencies: Phase 02, Phase 03, Phase 10.
- Owned paths: `package/build-package.mjs`, `package/package-contract.yaml`, `scripts/install-account-root-harness.mjs`, `docs/public/installer-usage.md`, `docs/public/runtime-control-plane.md`, `tests/package-materialization.test.mjs`, `tests/package-layout.test.mjs`.
- Read-only paths: live account-root state except explicit user-approved install/sync step; generated package output during dry-run.
- Adoption targets: package materialization, temp-home install, live account-root install, downstream rollout.
- Live mutation policy: default is dry-run/temp-home only; live account-root mutation requires explicit phase-owned adoption approval.
- Required evidence: source/package/temp-home/live smoke separation, native dependency availability or typed degraded blocker, state preservation fixture, rollback checklist.
- Conflicts: supported matrix degraded as success, live install without approval, state deletion, package payload containing generated state.
- Staged paths: package materializer/contract, installer, runtime docs, package tests.
- Closure traceability: matrix result table, smoke outputs, state preservation evidence, rollback checklist.

## Required Work

- Materialize support scripts, dependency metadata, and runtime dependency availability for account-root installs.
- Preserve existing project-local and account-root state during install/sync.
- Exclude generated DBs, WAL/SHM, verdict JSON, traces, logs, caches, browser artifacts, and profile-local state.
- Add source/package/temp-home/live smoke separation.
- Add downstream adoption checklist and rollback plan.

## Acceptance Criteria

- Source, package dry-run, temp installer dry-run, and account-root smoke produce consistent runtime-state capability results.
- Missing native dependencies produce typed degraded status and block authority claims.
- Install preserves existing user/project state.
- Downstream sync is a separate controlled step with evidence.

## Native Dependency Matrix Policy

| Target class | Expected result | Completion meaning |
|---|---|---|
| Supported OS/Node matrix | `working` runtime-state DB authority | Required for rollout success. |
| Supported matrix with missing native module | `typed_degraded_authority_blocked` | Negative-path evidence only; rollout remains blocked. |
| Unsupported OS/Node matrix | `unsupported` or `typed_degraded_authority_blocked` | Allowed only when documented as unsupported. |
| Package/temp-home smoke | `working` or explicit rollout blocker | Degraded cannot be counted as availability success. |

## Regression Contract

- Package materialization includes source support scripts and dependency delivery metadata.
- Package payload excludes generated DB/WAL/SHM, verdict JSON, traces, logs, caches, browser artifacts, and profile-local state.
- Temp-home install proves runtime-state capability without mutating live account-root.
- Live account-root adoption requires explicit approval and state preservation evidence.
- Missing native dependency degrades without claiming authority.

## Completion Evidence

- `npm run test:package`
- Package dry-run JSON
- Temp-home installer dry-run JSON
- Account-root runtime-state smoke or explicit approved deferred rollout blocker
