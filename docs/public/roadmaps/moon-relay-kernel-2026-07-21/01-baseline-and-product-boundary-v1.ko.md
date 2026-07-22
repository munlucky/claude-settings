# Phase 01 - Baseline and Product Boundary

## Objective

Relay 기준선을 동결하고 Kernel 제품 ID, 트랙, 평가 corpus, 승격 기준을 소스 계약으로 고정한다.

## Surface Classification

- `source_only`: `kernel/product.yaml`, 정책 문서, schemas, fixtures, tests.
- live profile/account-root 변경 없음.

## Owned Paths

```text
kernel/product.yaml
kernel/promotion-policy.yaml
schemas/kernel.track.schema.json
schemas/kernel.eval-case.schema.json
tests/fixtures/kernel-eval/**
tests/kernel-product-contract.test.mjs
tests/kernel-track-contract.test.mjs
tests/kernel-eval-corpus-contract.test.mjs
docs/public/guidelines/moon-relay-kernel-track.md
```

## Read-Only Paths

```text
package.json
package/package-contract.yaml
scripts/project-identity.mjs
tools/harness-lab/**
docs/public/reference/moonshot-relay-current-architecture/**
```

## Requirements

- KRN-REQ-001, KRN-REQ-017, KRN-REQ-019.

## Work

1. `moon-relay-kernel` 제품·트랙 schema를 정의한다.
2. Relay와 Kernel의 ID, runtime home, profile namespace, state namespace를 명시한다.
3. 대표 작업 30개 이상을 분석·버그·기능·리팩터링·UI·장기작업으로 분류한다.
4. 성공률, false completion, 입력 토큰, artifact 수, 개입 횟수, retry, LOC, dependency, 실행시간 metric을 정의한다.
5. main↔kernel 선택적 sync 정책을 문서화한다.

## Acceptance Criteria

- 제품 ID와 트랙 ID가 Relay 값과 충돌하지 않는다.
- 평가 corpus가 task class와 risk tier를 포함한다.
- 승격 hard gate와 quality gate가 기계 판독 가능한 정책으로 존재한다.
- 이 Phase는 package/profile/account-root를 변경하지 않는다.

## Spec-Test Obligations

- `KRN-REQ-001`: track schema RED→GREEN.
- `KRN-REQ-017`: malformed/underspecified eval case 거부.
- `KRN-SCN-003`: wrong-harness 기대 결과를 fixture에 포함.

## Verification

```bash
node --test tests/kernel-product-contract.test.mjs tests/kernel-track-contract.test.mjs tests/kernel-eval-corpus-contract.test.mjs
npm test
```

## Evidence

```text
artifacts/kernel/phase-01/product-contract.json
artifacts/kernel/phase-01/eval-corpus-summary.json
artifacts/kernel/phase-01/regression-summary.json
```

## Risks and Rollback

- 평가 corpus가 Relay에 유리하게 편향될 수 있다. 실제 과거 작업과 synthetic edge case를 분리 기록한다.
- 정책이 조기에 고정될 수 있다. Phase 07 dogfood 전까지 quality threshold는 candidate 상태로 유지한다.