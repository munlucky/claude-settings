# Containerized Harness Lab Loop - Master Plan v1

작성 기준일: 2026-06-24

## Scope Status

Status: plan-ready-source-first

이 패키지는 기존 `tools/harness-lab/harness-lab.mjs`의 `stable-root/candidate-root` 비교 모델을 Docker 기반 실행 환경으로 확장하는 작업문서다. 기존 H0 권위인 `authority: "external-bootstrap-lab"`은 유지한다. 변경된 하네스가 스스로 개선 판정을 내리지 않도록 baseline artifact, candidate artifact, comparator, promotion pointer를 분리한다.

이 패키지는 Docker 실행 환경을 계획하지만, 이 문서 자체는 Docker image publish, package runtime payload adoption, live account-root install을 승인하지 않는다.

```yaml
planPackage:
  schemaVersion: 1
  status: plan_ready_source_first
  planRoot: docs/implementation/containerized-harness-lab-loop-2026-06-24
  sourceDraft: docs/implementation/36-containerized-harness-lab-loop-v1.md
  selectedMasterPlan: docs/implementation/containerized-harness-lab-loop-2026-06-24/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/01-baseline-artifact-and-result-contract-v1.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/02-container-runner-and-isolation-v1.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/03-suite-fixtures-and-graders-v1.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/04-comparator-and-promotion-v1.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/05-calibration-rollback-and-operations-v1.md
  reviewArtifacts:
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/planning-loop/independent-reviewer-a.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/planning-loop/improvement-agent.md
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/planning-loop/plan-quality-review-iter-01.yaml
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "Markdown plan package only. No Docker, package, profile, or account-root mutation is authorized by this document alone."
```

## Objective

Build a repeatable harness improvement loop:

```text
initial loop:
  run baseline_0 container
  run candidate_1 container
  compare candidate_1 against baseline_0
  promote candidate_1 to baseline_1 only if H0 comparator passes

normal loop:
  load current baseline artifact
  run candidate_n+1 container only
  compare candidate_n+1 against stored baseline_n artifact
  promote candidate_n+1 to baseline_n+1 only if H0 comparator passes

calibration loop:
  rerun baseline_n and candidate_n+1 when non-determinism, runtime drift, or margin-threshold risk makes stored baseline unfair
```

## Existing Implementation Context

| Source | Role | Status |
|---|---|---|
| `tools/harness-lab/harness-lab.mjs` | Current H0 lab, stable/candidate runner, quantitative comparator, freeze command | active source |
| `tests/harness-lab-contract.test.mjs` | Contract coverage for candidate-only smoke, stable/candidate regression, metrics, account-root guard, artifact scorer | active test |
| `docs/public/guidelines/harness-bootstrap-lab.md` | Public operating contract for H0 lab | active policy doc |
| `package.json` | Official gates including `npm test`, `npm run test:lab`, `npm run test:eval`, `npm run test:package` | policy source |
| `package/package-contract.yaml` | Source/package/account-root payload boundary | policy source |
| `schemas/verification.contract.yaml` | Verification policy source | policy source |
| `docs/implementation/harness-improvement-loop-lab-2026-06-24/` | Prior non-containerized harness improvement loop plan and closeout evidence | reference input |

## Non-Negotiables

- H0 lab result remains the promotion authority; candidate-produced scorecards are evidence only.
- Candidate containers must not mount baseline outputs during task execution.
- Candidate containers must not receive the host Docker socket.
- Fixture inputs must be read-only.
- Baseline and candidate outputs must be written to separate run roots.
- Live `%USERPROFILE%/.moonshot-relay`, `%USERPROFILE%/.codex`, and `%USERPROFILE%/.claude` mutation is out of scope.
- Docker image publishing and shipped runtime payload adoption are blocked until an explicit policy source is added.
- Candidate-only runs are smoke evidence and cannot claim improvement without a baseline artifact.
- Baseline promotion requires immutable artifact hashes and an atomic pointer update.

## Policy Sources

Concrete repository gates in this plan are sourced from:

- `AGENTS.md`: canonical source boundary and local runtime profile separation.
- `README.md`: official test contract and generated runtime-state exclusions.
- `package.json`: `npm test`, `npm run test:lab`, `npm run test:eval`, `npm run test:package`.
- `package/package-contract.yaml`: package payload, account-root install, runtime profile, and live mutation policy.
- `schemas/verification.contract.yaml`: verification profiles and mechanical skip policy.
- `docs/public/guidelines/harness-bootstrap-lab.md`: current H0 lab authority, stable/candidate comparison, account-root isolation, promotion/rollback.
- `docs/public/runtime-state-cleanup.md`: generated state cleanup boundary.

Missing policy gate:

- Docker registry publish policy is not present. Until added, this plan allows local container build/run design only and forbids image publication or inclusion of Docker artifacts in installed runtime payloads.

## Surface Classification

| Surface | Classification | In Scope | Policy Source Paths | Required Evidence Slots |
|---|---|---|---|---|
| `tools/harness-lab/**` | `source_only` | yes | `AGENTS.md`, `README.md`, `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | targeted Node tests, `npm run test:lab`, lab result JSON |
| `tests/**`, `tests/fixtures/**` | `source_only` | yes | `AGENTS.md`, `README.md` | deterministic fixture identity hash, grader tests |
| `Dockerfile`, `docker-compose*.yml`, container helper scripts | `source_only` initially; `package_runtime_payload` only if later shipped | yes, local-only | `AGENTS.md`, `README.md`; missing Docker publish policy | local build log, container smoke run, no-publish assertion |
| `.harness-lab/**` or `.moonshot-relay/harness-lab-runs/**` generated runs | `data_or_state_migration` | generated local state only | `README.md`, `docs/public/runtime-state-cleanup.md` | retention policy, cleanup/rollback evidence |
| Baseline tarballs/images/manifests | `data_or_state_migration` | yes, generated evidence | `docs/public/guidelines/harness-bootstrap-lab.md` | freeze manifest, artifact SHA-256, image digest if containerized |
| Installed account-root profiles | `installed_profile_or_account_root` | live mutation out of scope | `AGENTS.md`, `package/package-contract.yaml`, `schemas/verification.contract.yaml` | temp-home pre/post fingerprint; explicit approval before live mutation |
| External base images/registries | `external_deployment_or_service` | dependency only | missing Docker publish policy | pinned base image digest or documented local-only fallback |

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
|---|---|---|---|---|
| 01 | Baseline Artifact and Result Contract | `01-baseline-artifact-and-result-contract-v1.md` | - | source-first ready |
| 02 | Container Runner and Isolation | `02-container-runner-and-isolation-v1.md` | 01 | source-first ready, local Docker only |
| 03 | Suite Fixtures and Graders | `03-suite-fixtures-and-graders-v1.md` | 01, 02 | source-first ready |
| 04 | Comparator and Promotion | `04-comparator-and-promotion-v1.md` | 01, 02, 03 | source-first ready |
| 05 | Calibration, Rollback, and Operations | `05-calibration-rollback-and-operations-v1.md` | 01, 02, 03, 04 | source-first ready |

## Acceptance Matrix

| ID | Phase | Criterion | Evidence Path |
|---|---|---|---|
| HLAB-001 | 01 | Baseline artifact manifest records source fingerprint, artifact hash, run id, suite id, and scorer version. | `execution/phase-01/baseline-artifact-manifest.json` |
| HLAB-002 | 02 | Initial mode runs baseline and candidate containers against the same smoke suite. | `execution/phase-02/initial-container-run/` |
| HLAB-003 | 02 | Candidate container cannot read baseline outputs during task execution. | `execution/phase-02/volume-policy-audit.json` |
| HLAB-004 | 03 | Suite fixture identity includes `fixtureSetId`, `fixtureId`, and `inputHash`; mismatch blocks improvement claims. | `execution/phase-03/fixture-identity-test.log` |
| HLAB-005 | 03 | All grader scores are normalized `0.0-1.0` and include threshold verdicts. | `execution/phase-03/grader-schema-test.json` |
| HLAB-006 | 04 | Comparator detects baseline pass/candidate fail as `new_failed_task`. | `execution/phase-04/regression-fixture-report.json` |
| HLAB-007 | 04 | Promotion updates `baselines/current.json` only after comparator pass and uses atomic pointer replacement. | `execution/phase-04/promotion-atomicity-test.log` |
| HLAB-008 | 05 | Rollback restores a prior baseline pointer without mutating fixtures or live account roots. | `execution/phase-05/rollback-pointer-test.log` |
| HLAB-009 | 05 | Candidate-only normal loop compares against stored baseline artifact; no baseline rerun is required unless calibration triggers fire. | `execution/phase-05/normal-loop-report.json` |
| HLAB-010 | all | Existing active gates remain green outside container mode. | `execution/phase-XX/npm-test.log`, `execution/phase-XX/npm-run-test-lab.log` |

## Calibration Policy

Stored baseline artifacts may be used for normal candidate-only loops. Baseline rerun is required when any condition is true:

- Any blocking grader uses an LLM judge, external API, model endpoint, wall-clock dependent data, or non-pinned container image.
- Host Node major version, Docker engine major version, base image digest, or scorer version changes.
- Candidate score is within `0.02` normalized score of the promotion threshold.
- Candidate runtime p95 exceeds stored baseline p95 by more than `20%`.
- The stored baseline is older than 14 days and the suite includes non-deterministic or external dependency markers.

## Review Status

Independent review and improvement sidecars found blocking gaps in the source draft. Accepted changes are recorded in `planning-loop/plan-quality-review-iter-01.yaml` and applied by this parent-owned plan package.

## Completion Rule

This plan package is complete when all five phase docs and planning-loop review artifacts exist, surface classifications are recorded, concrete gates are policy-sourced or marked as missing policy, and phase evidence slots are explicit. Execution closeout is separate and requires phase-local scorecard, QA, handoff, and lab evidence for every executed phase.

