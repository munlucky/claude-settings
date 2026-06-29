# Phase 03 - Runtime/Auth Isolation Hard Gates v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "03"
  title: "Runtime/Auth Isolation Hard Gates"
  status: planned
  dependsOn:
    - "01"
    - "02"
  surfaceClassification:
    - source_only
    - installed_profile_or_account_root
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tools/harness-lab/codex-cli-smoke.mjs
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/**
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - live account-root profiles
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - writing live account-root profiles
      - mounting host auth into candidate benchmark container
      - copying auth files into output artifacts
      - Docker registry publish
      - git commit or push
  requiredEvidenceSlots:
    - runtime_degraded_blocks
    - auth_source_absent_from_candidate_stage
    - auth_dev_smoke_separate_stage
    - no_auth_artifact_scan
    - strict_run_policy_json
    - auth_smoke_command_contract
```

## Objective

Turn runtime and auth checks into hard product-level gates without weakening candidate benchmark isolation.

## Required Behavior

- Installed runtime smoke status `degraded`, `failed`, or missing native capability must fail Docker lab result and promotion.
- Candidate benchmark container must not mount host Codex `auth.json` or host `config.toml`.
- Auth/model-backed Codex smoke must run through the selected `npm run lab:auth-smoke` command in a separate stage with a separate artifact and explicit network policy.
- The candidate benchmark strict run remains `readOnlyRootFilesystem=true` and `networkMode=none` by default.
- `installed-runtime-smoke.json` is the authoritative runtime capability gate. Any `runtimeCapabilityStatus.status` other than `healthy` is a hard fail.
- `codex-cli-smoke.json` is the authoritative installed Codex CLI/profile gate.
- `codex-dev-smoke.json` is the separate auth/model capability gate. It is required only for `lab:auth-smoke` or when a promotion policy explicitly requires model-backed Codex capability; it is never allowed to share the candidate benchmark container.
- Output artifact scan must fail if `auth.json`, raw token-like fields, or copied host config contents appear under run artifacts.

## Stage Separation

```text
prepare stage:
  install dependencies and Codex CLI

candidate benchmark stage:
  no host auth mount
  network none
  read-only root filesystem
  run quantitative suites

auth/dev smoke stage:
  opt-in host auth mount
  network bridge
  no candidate benchmark suites
  write redacted codex-dev-smoke.json
```

Deprecated or re-routed scripts:

```text
lab:candidate:codex-auth      -> must not mount auth into candidate benchmark; replace with lab:auth-smoke plus lab:auto
lab:candidate:codex-dev-smoke -> must not run candidate benchmark and host auth in the same container; replace with lab:auth-smoke
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P03-AC1 | Runtime smoke `degraded` hard-fails lab and blocks promotion. | `execution/phase-03/runtime-degraded-block-test.json` |
| P03-AC2 | Candidate benchmark stage has no host auth source mounts. | `execution/phase-03/candidate-mount-audit.json` |
| P03-AC3 | Auth/dev smoke runs in a separate container/stage and writes redacted artifact. | `execution/phase-03/auth-dev-smoke-stage.json` |
| P03-AC4 | Artifact scan confirms no `auth.json` or raw auth/config payload under run output. | `execution/phase-03/no-auth-artifact-scan.txt` |
| P03-AC5 | Strict run policy records read-only root and default network isolation. | `execution/phase-03/strict-run-policy.json` |
| P03-AC6 | `package.json` exposes `lab:auth-smoke` and no candidate benchmark script mounts host auth. | `execution/phase-03/auth-command-contract.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- Docker candidate run proving candidate stage has no host auth mount
- `npm run lab:auth-smoke` proving separate auth stage when auth smoke is enabled
- recursive artifact scan for auth files and token-like payloads

## Out of Scope

- Persisting host Codex secrets.
- Desktop app validation.
- Publishing secret-scanning rules outside this package.
