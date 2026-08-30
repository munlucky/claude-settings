# Phase 06 - Risk-Adaptive Proof and Safe Wave

> **Current implementation note (2026-08-30):** The original phase title and
> roadmap references are retained for provenance. The implemented boundary is
> derived Step Ledger parallel selection with transient Host admission; no
> persistent Wave, batch, group, or integration lifecycle remains.

## Objective

작업 위험에 비례하는 proof pipeline과 Evidence Pack 선택을 구현하고,
병렬 실행 가능성은 기존 Step Ledger에서 파생해 transient Host admission으로
검증한다.

## Surface Classification

- `source_only`: risk classifier, proof router, Step Ledger selection, receipts, tests.
- 구현 fanout은 reviewed `agentFanoutContract` 없이는 금지.

## Owned Paths

```text
kernel/proof-policy.yaml
kernel/wave-policy.yaml
scripts/kernel/risk-classify.mjs
scripts/kernel/proof-route.mjs
scripts/kernel/run/run-step-ledger.mjs
scripts/host/kernel/parallel-dispatcher.mjs
schemas/kernel.risk-receipt.schema.json
schemas/kernel.proof-receipt.schema.json
schemas/kernel.slice-graph.schema.json
schemas/kernel.wave-plan.schema.json
tests/kernel-proof-tier.test.mjs
tests/kernel-parallel-selection.test.mjs
tests/kernel-parallel-scope.test.mjs
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
4. Step Ledger의 dependency, `predictedWriteSet`, `sharedSurfaces`, local/afterMerge verification을 검증한다.
5. 병렬 eligibility는 Step facts에서 파생하고, dispatch 결과는 기존 execution receipts에 귀속한다.
6. write-set·schema·public interface·fixture 충돌이나 stale evidence가 있으면 기존 Step selection으로 fallback한다.
7. reviewer/fanout 입력은 isolated summary와 bounded tools만 허용한다.

## Acceptance Criteria

- 문서 오타 fixture는 T0/E0로 분류된다.
- 인증·migration fixture는 T3/E2로 분류된다.
- 고위험 신호가 하나라도 강제 조건이면 낮은 tier로 내려가지 않는다.
- 독립 write-set은 transient projection으로 eligible로, shared schema는 conflict로 분류된다.
- 실제 worker fanout이 발생해도 별도의 durable batch/group lifecycle은 생성되지 않는다.
- fresh verification 없는 completion은 거부된다.

## Spec-Test Obligations

- `KRN-SCN-004`~`007`, `014` 필수.
- risk under-classification negative tests.
- parallel selection false-positive와 recovery/fencing regression tests.

## Verification

```bash
node --test tests/kernel-proof-tier.test.mjs tests/kernel-parallel-selection.test.mjs tests/kernel-parallel-scope.test.mjs tests/kernel-completion-proof.test.mjs tests/kernel-parallel-recovery.test.mjs
node --test tests/verification-plane-contract.test.mjs tests/phase-final-guard-contract.test.mjs
npm test
```

## Evidence

```text
artifacts/kernel/phase-06/risk-tier-matrix.json
artifacts/kernel/phase-06/proof-receipts/**
artifacts/kernel/phase-06/parallel-selection.json
artifacts/kernel/phase-06/parallel-scope.json
```

## Risks and Rollback

- risk classifier가 잘못 낮은 tier를 선택할 수 있다. security/data/schema/public-contract 신호는 monotonic hard floor로 구현한다.
- transient parallel dispatch는 Step attempt, mutation fence, recovery receipt가 기준을 통과할 때만 admission한다.
