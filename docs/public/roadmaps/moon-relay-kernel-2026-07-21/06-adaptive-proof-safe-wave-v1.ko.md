# Phase 06 - Risk-Adaptive Proof and Safe Wave

## Objective

작업 위험에 비례하는 proof pipeline과 Evidence Pack 선택을 구현하고, Safe Wave는 dry-run 분석부터 도입한다.

## Surface Classification

- `source_only`: risk classifier, proof router, DAG/wave planner, receipts, tests.
- 구현 fanout은 reviewed `agentFanoutContract` 없이는 금지.

## Owned Paths

```text
kernel/proof-policy.yaml
kernel/wave-policy.yaml
scripts/kernel/risk-classify.mjs
scripts/kernel/proof-route.mjs
scripts/kernel/dag-build.mjs
scripts/kernel/wave-plan.mjs
scripts/kernel/wave-conflict.mjs
schemas/kernel.risk-receipt.schema.json
schemas/kernel.proof-receipt.schema.json
schemas/kernel.slice-graph.schema.json
schemas/kernel.wave-plan.schema.json
tests/kernel-proof-tier.test.mjs
tests/kernel-wave-planner.test.mjs
tests/kernel-wave-conflict.test.mjs
tests/kernel-completion-proof.test.mjs
```

## Read-Only Paths

```text
schemas/verification.contract.yaml
scripts/verification-plane.mjs
skills/completion-verifier/**
docs/public/guidelines/external-skill-pattern-transfer.md
templates/execution/**
tools/sandbox/policy.mjs
```

## Requirements

- KRN-REQ-006, 007, 011, 016, 020.

## Work

1. security boundary, data impact, public contract, schema change, dependency, blast radius, reversibility, coverage, novelty를 risk input으로 정의한다.
2. T0 deterministic, T1 compact, T2 dual, T3 full proof routing을 구현한다.
3. Evidence Pack E0~E2 선택을 risk, duration, slice count, release need와 연결한다.
4. slice graph의 `blockedBy`, `predictedWriteSet`, `sharedSurfaces`, local/afterMerge verification을 검증한다.
5. v1은 Wave eligibility와 conflict report만 생성하고 실행은 순차 유지한다.
6. 후속 flag에서만 `maxWorkers=2`를 허용하며 write-set·schema·public interface·fixture 충돌 시 순차 fallback한다.
7. reviewer/fanout 입력은 isolated summary와 bounded tools만 허용한다.

## Acceptance Criteria

- 문서 오타 fixture는 T0/E0로 분류된다.
- 인증·migration fixture는 T3/E2로 분류된다.
- 고위험 신호가 하나라도 강제 조건이면 낮은 tier로 내려가지 않는다.
- 독립 write-set은 eligible로, shared schema는 conflict로 분류된다.
- 기본 설정에서 실제 worker fanout은 발생하지 않는다.
- fresh verification 없는 completion은 거부된다.

## Spec-Test Obligations

- `KRN-SCN-004`~`007`, `014` 필수.
- risk under-classification negative tests.
- parallel eligibility false-positive regression tests.

## Verification

```bash
node --test tests/kernel-proof-tier.test.mjs tests/kernel-wave-planner.test.mjs tests/kernel-wave-conflict.test.mjs tests/kernel-completion-proof.test.mjs
node --test tests/verification-plane-contract.test.mjs tests/phase-final-guard-contract.test.mjs
npm test
```

## Evidence

```text
artifacts/kernel/phase-06/risk-tier-matrix.json
artifacts/kernel/phase-06/proof-receipts/**
artifacts/kernel/phase-06/wave-dry-run.json
artifacts/kernel/phase-06/conflict-fixtures.json
```

## Risks and Rollback

- risk classifier가 잘못 낮은 tier를 선택할 수 있다. security/data/schema/public-contract 신호는 monotonic hard floor로 구현한다.
- Wave 실제 실행은 dry-run precision이 기준을 통과하기 전 활성화하지 않는다.