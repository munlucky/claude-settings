# Phase 03 - Account-Root Isolation and Rollback Guard v1

## Status

Status: foundation-batch-ready-after-phase-01-guard-fields

## Objective

Prove that harness improvement experiments do not mutate the real installed account-root profiles: `%USERPROFILE%\.moonshot-relay`, `%USERPROFILE%\.codex`, or `%USERPROFILE%\.claude`.

This phase is part of the Phases 01-03 foundation batch. The user-facing improvement environment is not complete until this guard passes.

## Owned Paths

- `tools/harness-lab/**`
- `tests/**`
- optional guard helper under `scripts/lib/**` only if shared source reuse is justified
- `docs/public/guidelines/harness-bootstrap-lab.md`

## Read-Only Paths

- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `schemas/verification.contract.yaml`

## Surface Classification

| Surface | Classification | Mutation Policy |
|---|---|---|
| guard code and tests | `source_only` | allowed |
| temp homes under lab run root | `data_or_state_migration` | allowed as generated run state |
| real account-root profiles | `installed_profile_or_account_root` | forbidden unless a later live-adoption phase is explicitly approved |

## Required Behavior

- Before lab execution, fingerprint protected account-root paths if they exist.
- During lab execution, force:
  - `MOONSHOT_RELAY_HOME=<runRoot>/homes/<label>/moonshot-relay`
  - `PHASE_RUNTIME_DB=<runRoot>/homes/<label>/runtime-state.sqlite`
  - any future profile home overrides into run-local temp homes.
- After lab execution, re-fingerprint protected account-root paths.
- If any protected account-root fingerprint changes, fail the lab with `failureClass: account_root_contamination`.
- Record the protected path list and fingerprint status in `lab-result.json`.
- Keep path reporting redaction-safe and portable where possible.

## Environment Override Policy

Protected roots are resolved before any child-process home override. Lab child processes must then receive run-local homes:

```yaml
environmentOverridePolicy:
  protectedRootsResolvedBeforeOverride:
    moonshotRelayHome: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}"
    codexHome: "${CODEX_HOME:-~/.codex}"
    claudeHome: "${CLAUDE_HOME:-~/.claude}"
  childProcessMustSet:
    MOONSHOT_RELAY_HOME: "<runRoot>/homes/<label>/moonshot-relay"
    PHASE_RUNTIME_DB: "<runRoot>/homes/<label>/runtime-state.sqlite"
    CODEX_HOME: "<runRoot>/homes/<label>/codex"
    CLAUDE_HOME: "<runRoot>/homes/<label>/claude"
    HOME: "<runRoot>/homes/<label>/user-home"
    USERPROFILE: "<runRoot>/homes/<label>/userprofile"
```

If a suite needs to inspect the real account root, it must be declared as a read-only diagnostic suite and must not run in the default promotion gate.

## Protected Roots

Initial guard set:

- `%USERPROFILE%\.moonshot-relay`
- `%USERPROFILE%\.codex`
- `%USERPROFILE%\.claude`

## Fingerprint Contract

```yaml
accountRootGuard:
  includedGlobs:
    - "**/*"
  excludedGlobs:
    - "**/.git/**"
    - "**/*.sqlite-wal"
    - "**/*.sqlite-shm"
    - "**/logs/**"
    - "**/cache/**"
    - "**/sessions/**"
    - "**/node_modules/**"
    - "**/plugins/**"
    - "**/backups/**"
    - "**/runtimes/**"
    - "**/state/**"
    - "**/projects/**"
    - "**/tmp/**"
    - "**/.tmp/**"
    - "**/*.lock"
    - "**/models_cache.json"
    - "**/.codex-global-state.json"
    - "**/.codex-global-state.json.tmp"
    - "**/logs_*.sqlite*"
    - "**/state_*.sqlite*"
  symlinkPolicy: "hash link metadata; do not follow targets outside the protected root"
  absentPolicy: "absent before and absent after passes; absent before and present after fails"
  unreadablePolicy: "block promotion with account_root_guard_unavailable"
  concurrencyPolicy: "if durable protected-root fingerprint changes during run, block as account_root_contamination; known live Codex volatile runtime files are excluded so normal host activity does not make the lab nondeterministic"
```

Digest algorithm:

- Walk included entries under each protected root after applying excluded globs.
- Normalize paths to forward-slash relative paths.
- Sort entries lexicographically.
- For each file at or below the configured size cap, hash exact file bytes with SHA-256.
- For files above the size cap, hash `relativePath`, size, and mtime UTC and mark `contentHashSkipped: true`.
- For directories, include `relativePath` and child entry count.
- For symlinks or junctions, hash link metadata and do not follow targets outside the protected root.
- If a root is absent before and absent after, its status is `absent_unchanged`.
- If any included entry is unreadable, the guard status is `failed` with `failureClass: account_root_guard_unavailable`.

## accountRootGuard JSON Contract

Minimum shape inside `lab-result.json`:

```json
{
  "status": "passed|failed|not_applicable",
  "failureClass": "none|account_root_contamination|account_root_guard_unavailable",
  "mode": "pre_post_fingerprint_with_temp_home_overrides",
  "protectedRoots": [
    {
      "id": "codex",
      "displayPath": "%USERPROFILE%/.codex",
      "beforeDigest": "sha256:<hex>|absent|unavailable",
      "afterDigest": "sha256:<hex>|absent|unavailable",
      "changed": false,
      "changedPathsRedacted": []
    }
  ]
}
```

`changedPathsRedacted` must not expose secret-like path segments. It may use root-relative paths or category labels when full names are sensitive.

## Acceptance Criteria

- Temp-home fixture proves writes are contained under lab run root.
- Intentional protected-root mutation fixture fails the guard without leaving persistent damage.
- Child suite environment includes run-local `MOONSHOT_RELAY_HOME`, `PHASE_RUNTIME_DB`, `CODEX_HOME`, `CLAUDE_HOME`, `HOME`, and `USERPROFILE`.
- Normal `npm run test:lab` passes without touching protected account roots.
- `lab-result.json` records isolation evidence.

## Required Evidence

- Targeted account-root guard tests.
- Passing temp-home smoke.
- Passing `npm run test:lab`.
- Lab result path showing account-root guard status.

## Out of Scope

- Live account-root installer execution.
- Package payload adoption.
- Profile parity closeout.

## Phase 03 Closeout

Status: complete

Implemented by the harness lab run-local environment overrides and account-root fingerprint guard in `tools/harness-lab/harness-lab.mjs`.
