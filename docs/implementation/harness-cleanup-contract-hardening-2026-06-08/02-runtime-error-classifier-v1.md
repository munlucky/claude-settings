# Phase 02 - Runtime Error Classifier v1

## Purpose

Make runtime-state degraded status actionable by mapping native module, permission, sandbox, lock, schema, and path failures to typed reasons with recovery hints.

## Execution Metadata

```yaml
phase: 02
title: Runtime Error Classifier
dependsOn:
  - 01-git-safe-child-process-v1
conflictsWith: []
ownedPaths:
  - scripts/lib/runtime-state-store.mjs
  - scripts/runtime-state.mjs
  - docs/public/runtime-control-plane.md
  - tests/runtime-state-error-classifier.test.mjs
  - tests/runtime-control-plane-contract.test.mjs
readOnlyPaths:
  - schemas/verification.contract.yaml
  - scripts/phase-final-guard.mjs
  - package/**
sharedMutablePaths:
  - tests/runtime-control-plane-contract.test.mjs
adoptionTargets: []
liveMutationPolicy: source_only
```

## Implementation Contract

Add named exports in `scripts/lib/runtime-state-store.mjs`:

- `runtimeStoreErrorCode(error, phase)`
- `recoveryHintForRuntimeReason(reason)`

Supported reason values:

- `missing_native_module`
- `permission_denied`
- `sandbox_denied`
- `db_lock_timeout`
- `schema_mismatch`
- `unresolved_db_path`
- `schema_or_open_failure`

Classifier mapping:

- `EPERM`, `EACCES`, `permission denied`, `access is denied` -> `permission_denied`
- `sandbox`, `managed sandbox`, `operation not permitted` -> `sandbox_denied`
- `busy`, `locked`, `SQLITE_BUSY`, `SQLITE_LOCKED` -> `db_lock_timeout`
- `SQLITE_CORRUPT`, `no such table`, `schema`, `migration` -> `schema_mismatch`
- unresolved/empty database path failures -> `unresolved_db_path`
- native module load failures -> `missing_native_module`
- unknown open/setup failures -> `schema_or_open_failure`

Runtime behavior:

- `degradedRuntimeStatus()` includes `runtimeCapabilityStatus.recoveryHint`.
- `resumeBrief.nextAction` uses the reason-specific recovery hint.
- `openRuntimeDatabase()` routes both directory creation failures and DB open failures through the classifier.
- `scripts/runtime-state.mjs` recognizes the expanded `runtimeStoreErrorCodes` set.

## Acceptance Criteria

- Synthetic unit tests cover each reason value without relying on real filesystem permission failures.
- Existing `MOONSHOT_RUNTIME_STATE_DISABLE_NATIVE=1` degraded behavior remains compatible.
- `runtime-state status --json` returns either available state or a typed degraded payload with `recoveryHint`.
- Documentation explains why `schema_or_open_failure` remains as fallback only.

## Verification

```powershell
node --test tests/runtime-state-error-classifier.test.mjs tests/runtime-control-plane-contract.test.mjs
node scripts/runtime-state.mjs status --json
```
