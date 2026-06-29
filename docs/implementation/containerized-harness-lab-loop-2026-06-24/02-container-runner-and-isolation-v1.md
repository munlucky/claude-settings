# Phase 02 - Container Runner and Isolation v1

Status: complete

## Phase Metadata

```yaml
phaseMetadata:
  phaseId: "02"
  title: "Container Runner and Isolation"
  status: complete
  dependsOn:
    - "01"
  surfaceClassification:
    - source_only
    - data_or_state_migration
    - external_deployment_or_service
  ownedPaths:
    - tools/harness-lab/**
    - tests/harness-lab-contract.test.mjs
    - tests/fixtures/harness-lab/**
    - Dockerfile
    - docker-compose*.yml
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - ${USERPROFILE}/.moonshot-relay/**
    - ${USERPROFILE}/.codex/**
    - ${USERPROFILE}/.claude/**
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - Dockerfile
      - docker-compose*.yml
      - docs/**
      - .moonshot-relay/harness-lab-runs/** as generated evidence only
    forbidden:
      - Docker registry publish
      - Docker socket mount into candidate container
      - baseline output mount into candidate container
      - live account-root profile mutation
  requiredEvidenceSlots:
    - docker_build_log
    - container_smoke_run
    - volume_policy_audit
    - account_root_pre_post_fingerprint
```

## Objective

Add local-only container execution for stable/baseline and candidate harness roots while preserving H0 lab authority and account-root isolation.

## Required Behavior

- Baseline and candidate containers receive identical suite config and read-only fixtures.
- Candidate container gets only candidate source, read-only fixtures, and candidate output volume.
- Candidate container must not mount baseline output, baseline manifest, host Docker socket, or real account-root paths.
- Baseline container is used for initial/calibration loops only. Normal loops may run candidate only against stored baseline artifact.
- Container child environment must redirect `MOONSHOT_RELAY_HOME`, `PHASE_RUNTIME_DB`, `CODEX_HOME`, `CLAUDE_HOME`, `HOME`, and `USERPROFILE` to the run root.

## Volume Policy

```yaml
baselineContainer:
  readonlyMounts:
    - fixtures
    - baselineSource
  writableMounts:
    - runs/baseline/<runId>
  forbiddenMounts:
    - runs/candidate
    - host docker socket
    - live account roots

candidateContainer:
  readonlyMounts:
    - fixtures
    - candidateSource
  writableMounts:
    - runs/candidate/<runId>
  forbiddenMounts:
    - baselines/**
    - runs/baseline/**
    - host docker socket
    - live account roots
```

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P02-AC1 | Local container smoke can execute candidate suite and persist run output outside candidate authority. | `execution/phase-02/container-smoke-run.json` |
| P02-AC2 | Candidate cannot read baseline output path during execution. | `execution/phase-02/volume-policy-audit.json` |
| P02-AC3 | Host Docker socket is not mounted. | `execution/phase-02/volume-policy-audit.json` |
| P02-AC4 | Account-root guard passes with temp homes. | `execution/phase-02/account-root-guard.json` |
| P02-AC5 | No image publication occurs. | `execution/phase-02/no-publish-assertion.log` |

## Required Evidence Commands

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:lab`
- Local Docker build/run command recorded in phase evidence. This command is phase-local design evidence, not package or publish policy.

## Blockers

- Docker registry publish remains blocked until a policy source defines allowed registry, signing, retention, and rollback.
