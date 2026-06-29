# Harness Lab Product Lifecycle Gate - Master Plan v1

작성 기준일: 2026-06-25

## Scope Status

Status: plan-ready-source-first

이 패키지는 `containerized-harness-lab-loop-2026-06-24` 이후 독립 리뷰에서 확인된 gap을 닫기 위한 후속 계획이다. 현재 Docker 기반 baseline/candidate 정량 비교 scaffold는 동작하지만, 제품 레벨 하네스 개선 루프의 완료 판정 권위로 쓰기에는 자동 bootstrap, promotion policy, auth/runtime isolation, artifact binding, rollback/calibration, closeout evidence가 부족하다.

```yaml
planPackage:
  schemaVersion: 1
  status: plan_ready_after_review_iteration_01
  planRoot: docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25
  parentPlan:
    - docs/implementation/containerized-harness-lab-loop-2026-06-24/00-master-plan-v1.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/05-improvement-loop-operation-and-promotion-v1.md
  selectedMasterPlan: docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/01-auto-bootstrap-lifecycle-command-v1.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/02-promotion-policy-and-improvement-gates-v1.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/03-runtime-auth-isolation-hard-gates-v1.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/04-promotion-rollback-integrity-v1.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/05-closeout-calibration-and-operator-flow-v1.md
  reviewArtifacts:
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/planning-loop/plan-quality-review-iter-01.yaml
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "Markdown plan package only. Source implementation requires moonshot-phase-runner or moonshot-orchestrator execution with fresh review and lab evidence."
```

## Objective

Upgrade the local harness lab from a Docker comparison scaffold into a product-level lifecycle gate:

```text
no baseline:
  auto-bootstrap baseline from selected baseline ref
  run baseline Docker benchmark
  run candidate Docker benchmark from current checkout
  compare with explicit policy
  emit promotion decision

existing baseline:
  run candidate Docker benchmark only
  compare against stored baseline artifact
  promote only when policy, runtime gates, identity binding, and integrity checks pass

closeout:
  emit lab closeout evidence for commit workflow
  do not auto-commit source unless a separately approved commit workflow consumes the evidence
```

## Current Gap Summary

| Gap | Current State | Required State |
|---|---|---|
| Baseline missing | `candidate` errors and requires manual `lab:init`. | `lab:auto` bootstraps baseline/candidate when no current baseline exists. |
| Improvement policy | Comparator passes on no regression; equal score is promotable. | Policy supports explicit `no_regression` and `strict_improvement` modes with recorded threshold. |
| Runtime smoke | Installed runtime `degraded` can still pass Docker lab. | Blocking runtime capability degradation fails candidate and promotion. |
| Auth isolation | Host Codex auth source can coexist with candidate suite execution. | Auth/model-backed smoke runs in a separate container/stage; candidate benchmark never mounts host auth source. |
| Promotion binding | Compare report and candidate artifact are not strongly cross-bound. | Promotion verifies candidate run id, baseline pointer, compare hash, fixture identity, source fingerprint, and policy mode. |
| Rollback/current pointer | Pointer rollback is lightweight. | Rollback validates manifest/artifact existence and records audit evidence. |
| Calibration | Baseline rerun policy is manual. | Candidate loop reports calibration requirement and can run a calibration path. |
| Commit/complete | Commit is outside lab and not connected to lab evidence. | Lab emits closeout receipt; commit workflow remains explicit and consumes the receipt. |

## Non-Negotiables

- H0 lab artifacts remain outside candidate authority.
- Candidate-produced reports, chat output, `verify.json`, or `score.json` cannot promote a candidate.
- Candidate benchmark containers must not mount baseline outputs, live account roots, host Docker socket, or host Codex auth source.
- Host Codex auth use is opt-in and limited to a separate auth/dev-smoke stage.
- Default candidate benchmark strict run keeps `readOnlyRootFilesystem=true` and `networkMode=none`.
- `codex-dev-smoke` may use network only in a separate, explicitly marked stage.
- Promotion requires compare authority plus candidate/baseline identity binding.
- Source commit remains outside automatic lab execution unless a future plan explicitly adopts a commit workflow.

## Policy Sources

Concrete repository gates and mutation boundaries are sourced from:

- `AGENTS.md`
- `README.md`
- `package.json`
- `package/package-contract.yaml`
- `schemas/verification.contract.yaml`
- `docs/public/guidelines/harness-bootstrap-lab.md`
- `docs/public/runtime-state-cleanup.md`
- `docs/implementation/containerized-harness-lab-loop-2026-06-24/00-master-plan-v1.md`
- `docs/implementation/harness-improvement-loop-lab-2026-06-24/05-improvement-loop-operation-and-promotion-v1.md`

Missing, deferred, or phase-local policy:

- Automatic git commit after lab promotion is deferred. The selected strategy is a lab closeout receipt consumed by the existing explicit commit workflow.
- Docker registry publish policy remains missing. Local Docker build/run is allowed; image publication is out of scope.
- Host Codex auth injection is not generally approved. Phase 03 must add source-local auth-smoke policy to `docs/public/guidelines/harness-bootstrap-lab.md`; only a separate auth-smoke stage may mount host auth.
- Local base image provenance is phase-local: record `docker image inspect` id for local tags, record repo digest when available, and fail promotion evidence when neither image id nor digest can be captured.

## Surface Classification

| Surface | Classification | In Scope | Policy Source Paths | Required Evidence Slots |
|---|---|---|---|---|
| `tools/harness-lab/**` | `source_only` | yes | `AGENTS.md`, `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | targeted contract tests, Docker lab candidate run, compare report |
| `tests/harness-lab-contract.test.mjs`, fixtures | `source_only` | yes | `README.md`, `package.json` | positive and negative tests for policy, binding, degraded runtime, auth isolation |
| `package.json` lab scripts | `source_only` | yes | `package.json`, `README.md` | script contract test, manual command evidence |
| `docs/public/guidelines/harness-bootstrap-lab.md` | `source_only` | yes | `AGENTS.md` | docs contract test or keyword audit |
| `.moonshot-relay/harness-lab/**` generated state | `data_or_state_migration` | generated authority evidence only | `README.md`, `docs/public/runtime-state-cleanup.md`, this plan's generated-state retention policy | baseline pointer manifest, compare report, candidate summary, closeout receipt, rollback audit, retention manifest |
| Host Codex auth/config | `installed_profile_or_account_root` | read-only opt-in source for auth smoke only | `AGENTS.md`, `package/package-contract.yaml` | mount audit, no-auth-in-artifacts scan, separate-stage evidence |
| Docker image/container execution | `external_deployment_or_service` for base image dependency; local source-only config | local only | missing Docker publish policy | local image inspect/build evidence, no publish assertion, strict run policy JSON |

## Selected Operator Commands

These command names are selected by this plan and must be added to `package.json` before implementation closeout:

```text
npm run lab:auto
npm run lab:auto:promote
npm run lab:calibrate
npm run lab:auth-smoke
npm run lab:closeout
```

Existing scripts such as `lab:candidate:codex-auth` and `lab:candidate:codex-dev-smoke` must be replaced or re-routed so host auth is never mounted into the candidate benchmark stage.

## Generated-State Retention Policy

`docs/public/runtime-state-cleanup.md` may classify `.moonshot-relay/**` as generated local state, but this lifecycle gate treats selected `.moonshot-relay/harness-lab/**` files as local authority evidence while a candidate is open or a baseline is current.

Protected generated evidence:

- `baselines/current.json`
- `baselines/<baseline-id>/manifest.json`
- `baselines/<baseline-id>/lab-result.json`
- `baselines/<baseline-id>/compare-report.json`
- `compare/*.json`
- `runs/<candidate-id>/lab-result.json`
- `runs/<candidate-id>/candidate-summary.json`
- `runs/<candidate-id>/lab-closeout-receipt.json`
- rollback audit artifacts

Cleanup or GC must preserve all artifacts referenced by the current pointer, the previous baseline pointer, any open candidate summary, and any closeout receipt not yet consumed by a commit workflow.

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
|---|---|---|---|---|
| 01 | Auto Bootstrap Lifecycle Command | `01-auto-bootstrap-lifecycle-command-v1.md` | - | ready-source-first |
| 02 | Promotion Policy and Improvement Gates | `02-promotion-policy-and-improvement-gates-v1.md` | 01 | ready-source-first |
| 03 | Runtime/Auth Isolation Hard Gates | `03-runtime-auth-isolation-hard-gates-v1.md` | 01, 02 | ready-source-first |
| 04 | Promotion and Rollback Integrity | `04-promotion-rollback-integrity-v1.md` | 01, 02, 03 | ready-source-first |
| 05 | Closeout, Calibration, and Operator Flow | `05-closeout-calibration-and-operator-flow-v1.md` | 01, 02, 03, 04 | ready-source-first |

## Acceptance Matrix

| ID | Phase | Criterion | Evidence Path |
|---|---|---|---|
| HPLG-001 | 01 | `lab:auto` creates initial baseline/candidate evidence when no baseline pointer exists. | `execution/phase-01/auto-init-no-baseline.json` |
| HPLG-002 | 01 | Existing baseline path runs candidate only and compares against stored baseline artifact. | `execution/phase-01/candidate-only-existing-baseline.json` |
| HPLG-003 | 02 | Promotion policy records `no_regression` or `strict_improvement` and blocks candidates below the selected threshold. | `execution/phase-02/policy-mode-tests.log` |
| HPLG-004 | 02 | Equal score is promotable only in `no_regression` mode, not in `strict_improvement` mode. | `execution/phase-02/strict-improvement-equal-score-report.json` |
| HPLG-005 | 03 | Installed runtime `degraded` blocks lab result and promotion. | `execution/phase-03/runtime-degraded-block-test.json` |
| HPLG-006 | 03 | Candidate benchmark stage never mounts host Codex auth source; `lab:auth-smoke` is a separate command/stage. | `execution/phase-03/auth-stage-isolation-audit.json` |
| HPLG-007 | 04 | Promotion rejects mismatched candidate run id, compare candidate id, current baseline id, or fixture identity. | `execution/phase-04/promotion-binding-negative-tests.log` |
| HPLG-008 | 04 | Rollback validates manifest/artifact presence and records rollback audit evidence. | `execution/phase-04/rollback-integrity-test.json` |
| HPLG-009 | 05 | Calibration policy reports when baseline rerun is required and supports explicit calibration run. | `execution/phase-05/calibration-required-report.json` |
| HPLG-010 | 05 | Lab closeout receipt is emitted for commit workflow without auto-committing source. | `execution/phase-05/lab-closeout-receipt.json` |
| HPLG-011 | all | Active repository gates remain green. | `execution/phase-XX/npm-test.log` |

## Selected Commit/Complete Strategy

The lab must not auto-commit source changes. The product lifecycle gate closes its part by writing a `lab-closeout-receipt.json` that records:

- current baseline id
- candidate run id
- compare report path and hash
- promotion decision
- promotion policy mode
- source fingerprint
- required commit workflow command or handoff note

An explicit commit workflow may consume this receipt later. This preserves user control over git history and avoids treating lab promotion as repository closeout authority.

Receipt status values are:

```text
promoted_ready_for_commit_workflow
rejected_no_commit
blocked_hard_gate
calibration_required
```

## Review Status

Independent plan review is required because this package changes harness execution authority, generated state, and optional account-root auth handling. Review findings and accepted edits are recorded in `planning-loop/plan-quality-review-iter-01.yaml`.

## Completion Rule

This plan package is complete when the master plan, five phase docs, and review artifact exist; every phase declares metadata, owned/read-only paths, write-set boundaries, surface classification, required evidence slots, and acceptance criteria; and the closure gate verifies objective keywords and package paths.
