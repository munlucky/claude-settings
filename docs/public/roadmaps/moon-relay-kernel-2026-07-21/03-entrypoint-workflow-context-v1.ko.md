# Phase 03 - Entrypoint, Workflow, and Context Compiler

## Objective

단일 공개 진입점, 적응형 상태 머신, stage-scoped context compiler를 구현한다.

## Surface Classification

- `source_only`: router, workflow, context policy, skill catalog, schemas, tests.
- profile 노출은 Phase 07까지 보류한다.

## Owned Paths

```text
skills/moon-relay-kernel/**
kernel/principles.yaml
kernel/workflow.yaml
kernel/context-policy.yaml
kernel/capabilities.yaml
catalog/kernel-skills.yaml
scripts/kernel/route.mjs
scripts/kernel/transition.mjs
scripts/kernel/context-build.mjs
scripts/kernel/context-receipt.mjs
schemas/kernel.task-contract.schema.json
schemas/kernel.context-receipt.schema.json
schemas/kernel.workflow-state.schema.json
tests/kernel-entrypoint-contract.test.mjs
tests/kernel-workflow-state-machine.test.mjs
tests/kernel-context-compiler.test.mjs
tests/kernel-context-redaction.test.mjs
```

## Read-Only Paths

```text
skills/moonshot-orchestrator/**
skills/product-orchestrator/**
scripts/knowledge-context-build.mjs
docs/public/guidelines/context-relevance-policy.md
tools/sandbox/policy.mjs
catalog/**
```

## Requirements

- KRN-REQ-002, 003, 004, 016.

## Work

1. entrypoint가 objective, task class, ambiguity, risk, capability를 판정한다.
2. `FRAME → SHAPE → SLICE → SCHEDULE → EXECUTE → PROVE → CLOSE` 상태와 skip/replan 전이를 schema로 정의한다.
3. SHAPE·SLICE를 조건부 단계로 만들고 단순 작업 경로를 허용한다.
4. context를 Stable Principles, Task Contract, Stage Context, On-demand References, Evidence Digest로 조립한다.
5. raw log, transcript, secret-like content, 전체 KG dump를 차단한다.
6. 실제 포함·제외·token estimate·source revision을 context receipt로 남긴다.
7. active track이 Kernel이 아니면 `wrong_harness`로 실행을 거부한다.

## Acceptance Criteria

- 공개 Kernel skill은 기본적으로 하나다.
- 상태 전이는 schema 밖으로 이동할 수 없다.
- 같은 입력과 policy revision은 결정론적 receipt를 생성한다.
- 잘못된 트랙에서 실행·상태 mutation이 발생하지 않는다.
- 단순 작업은 SHAPE/SLICE를 생략할 수 있다.

## Spec-Test Obligations

- `KRN-SCN-003`: wrong-harness hard stop.
- low-risk 문서 변경과 high-risk schema 변경의 서로 다른 route fixture.
- secret/raw log negative fixture.

## Verification

```bash
node --test tests/kernel-entrypoint-contract.test.mjs tests/kernel-workflow-state-machine.test.mjs tests/kernel-context-compiler.test.mjs tests/kernel-context-redaction.test.mjs
npm test
```

## Evidence

```text
artifacts/kernel/phase-03/router-fixtures.json
artifacts/kernel/phase-03/context-receipts/**
artifacts/kernel/phase-03/workflow-transition-report.json
```

## Risks and Rollback

- thin entrypoint가 실제로는 거대한 prompt가 될 수 있다. always-loaded token budget contract를 테스트한다.
- 기존 context builder를 직접 수정하지 않고 Kernel adapter로 시작한다.