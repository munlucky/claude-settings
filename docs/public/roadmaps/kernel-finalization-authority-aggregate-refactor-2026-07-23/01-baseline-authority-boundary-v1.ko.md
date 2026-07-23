# Phase 01 - Baseline and Authority Boundary Freeze

## Objective

구현 전 현재 authority writer, public mutation surface, DB schema, runtime read path, Git side effect를 고정하고 독립 blocker-confirmation review를 완료한다. 이 Phase가 통과되기 전에는 production source를 수정하지 않는다.

## Phase Execution Metadata

```yaml
phaseExecutionMetadata:
  phaseId: PH-01
  dependsOn: []
  executionMode: sequential
  entryState: plan_published
  exitState: baseline_frozen
  implementationMutationAllowed: false
  owners:
    primary: finalization-architecture
    verification: independent-reviewer
  verificationSignals:
    - VS-public-authority-inventory
    - VS-db-baseline
    - VS-runtime-read-path-baseline
    - VS-git-postcondition-baseline
```

## Surface Classification

- `source_only`: baseline docs, tests, inventory scripts.
- `data_or_state_migration`: read-only inspection of disposable Kernel SQLite databases.
- `package_runtime_payload`: no mutation.
- `external_deployment_or_service`: no live remote interaction; disposable local bare remote only.

## Owned Paths

```text
docs/public/roadmaps/kernel-finalization-authority-aggregate-refactor-2026-07-23/**
tests/kernel-finalization-authority-inventory.test.mjs
tests/kernel-finalization-readiness-baseline.test.mjs
tests/kernel-git-index-postcondition.test.mjs
artifacts/kernel/finalization-refactor/phase-01/**
```

## Read-Only Paths

```text
scripts/kernel/control-plane.mjs
scripts/kernel/state-store.mjs
scripts/kernel/knowledge/**
scripts/kernel/git/**
bin/moon-relay-kernel.mjs
package.json
package/package-contract.yaml
schemas/verification.contract.yaml
```

## Write-Set Boundary

- 기존 runtime source 수정 금지.
- 테스트는 characterization 및 inventory 목적만 허용.
- 현재 behavior를 정당화하지 않고 observable baseline으로만 기록.
- 동일 owned path를 수정하는 다른 workstream이 있으면 Phase를 blocked 처리.

## Work

1. Completion decision row를 생성할 수 있는 모든 public·internal call path를 inventory한다.
2. Candidate, approval, evidence binding, review, knowledge commit mutation method를 inventory한다.
3. `CLOSE` 진입 전후 복구 가능성을 characterization test로 고정한다.
4. SQLite와 JSONL을 읽는 runtime path를 call graph로 기록한다.
5. Knowledge commit 전후 DB column과 JSON record status/type 차이를 기록한다.
6. Git closeout 성공 후 HEAD, index, selected/unselected path 상태를 실제 임시 repository에서 측정한다.
7. 기존 blocker tests를 다음으로 분류한다.
   - real integration
   - mock-only
   - mapping-only
   - receipt-only
8. 독립 reviewer에게 master plan, 설계, ADR, traceability, obligations를 전달하고 blocker-confirmation review를 받는다.
9. review에서 승인된 수정만 parent session이 plan package에 반영한다.

## Acceptance Criteria

- Completion authority writer inventory에 누락된 public method가 없다.
- `persistCompletionDecision`, `commitProjectKnowledge`, `commitKnowledgeTransaction`, `transition(..., CLOSE)`의 현재 호출자가 모두 식별된다.
- runtime SQLite/JSONL read path가 stage context, ontology, revision별로 분리되어 있다.
- current Git index postcondition을 재현하는 failing characterization test가 존재한다.
- mock-only blocker tests 목록과 교체 대상이 명시된다.
- 독립 review artifact가 `planning-loop/`에 추가되고 blocking finding이 0이거나 다음 Phase blocker로 명시된다.

## Spec-Test Obligations

- FAR-SCN-001 public authority inventory
- FAR-SCN-002 early finalize recoverability baseline
- FAR-SCN-003 evidence binding order baseline
- FAR-SCN-009 Git index baseline
- FAR-SCN-011 JSONL authority baseline

## Verification

```bash
node --test tests/kernel-finalization-authority-inventory.test.mjs tests/kernel-finalization-readiness-baseline.test.mjs tests/kernel-git-index-postcondition.test.mjs
node scripts/spec-test-obligations.mjs validate --json
node scripts/harness-surface-report.mjs check
```

## Evidence

```text
artifacts/kernel/finalization-refactor/phase-01/authority-writers.json
artifacts/kernel/finalization-refactor/phase-01/public-api-inventory.json
artifacts/kernel/finalization-refactor/phase-01/runtime-read-paths.json
artifacts/kernel/finalization-refactor/phase-01/test-quality-classification.json
artifacts/kernel/finalization-refactor/phase-01/git-postcondition-baseline.json
planning-loop/plan-quality-review-iter-02.yaml
```

## Risks and Rollback

- baseline test가 기존 defect를 통과 조건으로 고정하지 않도록 expected failure와 desired invariant를 함께 기록한다.
- 다른 workstream과 owned path가 겹치면 구현을 시작하지 않고 branch owner에게 조정한다.
