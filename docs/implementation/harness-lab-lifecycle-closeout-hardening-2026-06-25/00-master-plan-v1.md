# Harness Lab Lifecycle Closeout Hardening - Master Plan v1

작성 기준일: 2026-06-25

## Scope Status

Status: plan-ready-after-independent-gap-review

이 패키지는 `harness-lab-product-lifecycle-gate-2026-06-25` 구현 후 독립 리뷰에서 남은 제품 레벨 gap을 닫기 위한 후속 계획이다. 현재 Docker 기반 lifecycle은 운영 실험에 사용할 수 있지만, closeout evidence freshness, no-baseline bootstrap promotion, strict improvement floor, fixture identity completeness, legacy baseline refresh가 남아 있다.

```yaml
planPackage:
  schemaVersion: 1
  status: plan_ready_after_independent_gap_review
  planRoot: docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25
  parentPlan:
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/00-master-plan-v1.md
  selectedMasterPlan: docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/01-closeout-revalidation-gate-v1.md
    - docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/02-bootstrap-and-strict-policy-hardening-v1.md
    - docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/03-fixture-identity-and-baseline-refresh-v1.md
  reviewArtifacts:
    - docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/planning-loop/plan-quality-review-iter-01.yaml
  graphReadiness: markdown_only_not_dag_validated
```

## Objective

Close the remaining gaps so the harness lab can be treated as a product-level lifecycle gate:

```text
no baseline:
  lab:auto must leave a usable current baseline after passing bootstrap

existing baseline:
  lab:auto remains candidate-only unless explicit calibration is requested

promotion/closeout:
  commit workflow may consume only a freshly revalidated promoted receipt

policy:
  strict_improvement cannot be weakened to equal-score pass

identity:
  promotion-grade compare requires complete fixture identity

baseline:
  legacy baseline-0007 must be refreshed into a strengthened baseline manifest before claiming gate completion
```

## Current Gap Summary

| Gap | Current State | Required State |
|---|---|---|
| Closeout stale receipt | `lab:closeout` reports `consumableByCommitWorkflow` from receipt status only. | Revalidate current pointer, compare hash, candidate hash, runtime gate, promotion manifest, and source fingerprint before marking consumable. |
| No-baseline bootstrap | Plain `lab:auto` can compare successfully without creating `baselines/current.json`. | No-baseline `lab:auto` promotes a passing initial bootstrap to the first current baseline, or exits non-zero with explicit unpromoted status. Selected behavior: promote initial bootstrap by default. |
| Strict improvement floor | `--promotion-policy strict_improvement --min-delta 0` can allow equal score. | Strict mode enforces a positive minimum delta. Operator cannot set `minDelta <= 0`. |
| Fixture identity completeness | Missing identity on one side can still be treated as match. | Promotion-grade compare requires complete identity fields when any side declares identity. Missing required identity blocks promotion. |
| Legacy baseline | Active `baseline-0007` predates strengthened manifest evidence. | Add a refresh path and run it to create a new current baseline with policy/runtime/pointer evidence. |

## Non-Negotiables

- Candidate benchmark containers still must not mount host Codex auth.
- Existing-baseline `lab:auto` must remain candidate-only and must not rerun baseline automatically.
- Baseline rerun remains explicit through calibration or refresh commands.
- `lab:closeout` must not auto-commit or push source.
- Commit workflow consumption is allowed only after closeout revalidation passes.
- Legacy generated evidence may be read, but new promotion-grade completion must use strengthened manifests.

## Policy Sources

- `AGENTS.md`
- `package.json`
- `docs/public/guidelines/harness-bootstrap-lab.md`
- `schemas/verification.contract.yaml`
- `docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/00-master-plan-v1.md`

## Surface Classification

| Surface | Classification | In Scope | Required Evidence Slots |
|---|---|---|---|
| `tools/harness-lab/harness-loop.mjs` | `source_only` | yes | contract tests, command smoke, closeout negative tests |
| `tools/harness-lab/harness-lab.mjs` | `source_only` | yes | comparator tests, promote binding tests |
| `tests/harness-lab-contract.test.mjs` | `source_only` | yes | positive and negative unit/contract coverage |
| `package.json` scripts | `source_only` | maybe | script contract test if command surface changes |
| `docs/public/guidelines/harness-bootstrap-lab.md` | `source_only` | yes | keyword audit |
| `.moonshot-relay/harness-lab/**` | `data_or_state_migration` | generated evidence only | refreshed baseline manifest, current pointer, closeout receipt |

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Closeout Revalidation Gate | `01-closeout-revalidation-gate-v1.md` | - |
| 02 | Bootstrap and Strict Policy Hardening | `02-bootstrap-and-strict-policy-hardening-v1.md` | 01 |
| 03 | Fixture Identity and Baseline Refresh | `03-fixture-identity-and-baseline-refresh-v1.md` | 01, 02 |

## Acceptance Matrix

| ID | Phase | Criterion | Evidence Path |
|---|---|---|---|
| HLCH-001 | 01 | `lab:closeout` rejects stale or mismatched promoted receipts. | `execution/phase-01/closeout-stale-receipt-negative-test.log` |
| HLCH-002 | 01 | `lab:closeout` marks commit-consumable only after current pointer, hashes, runtime, promotion, and source freshness revalidate. | `execution/phase-01/closeout-revalidation-pass.json` |
| HLCH-003 | 02 | No-baseline `lab:auto` creates a current baseline after passing bootstrap. | `execution/phase-02/no-baseline-auto-bootstrap-promotes.json` |
| HLCH-004 | 02 | Existing-baseline `lab:auto` remains candidate-only and does not promote by default. | `execution/phase-02/existing-baseline-auto-candidate-only.json` |
| HLCH-005 | 02 | Strict improvement rejects `minDelta <= 0` and equal-score strict candidates. | `execution/phase-02/strict-min-delta-floor-tests.log` |
| HLCH-006 | 03 | Missing fixture identity on either side blocks promotion-grade compare. | `execution/phase-03/fixture-identity-completeness-test.log` |
| HLCH-007 | 03 | Active legacy baseline is refreshed into a strengthened current baseline. | `execution/phase-03/refreshed-baseline-manifest.json` |
| HLCH-008 | all | Active repository gates remain green. | `execution/final/npm-test.log` |

## Completion Rule

The follow-up is complete only when:

- all three phase docs and review artifact exist;
- tests cover closeout stale receipt rejection, strict delta floor, fixture identity completeness, and no-baseline bootstrap behavior;
- Docker lifecycle smoke verifies refreshed baseline promotion;
- `npm test` and `git diff --check` pass;
- `npm run lab:closeout` reports `consumableByCommitWorkflow=true` only for the refreshed promoted receipt.

