# Mutation fencing and Git closeout

- **ID**: `mutation-fencing-and-git-closeout`
- **Category**: `TRUST`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
허용된 mutation만 통과시키고 Git index, commit, remote parity를 안전한 closeout 경계로 묶는다.

## Subcapabilities Traceability
### `mutation-scope-safety` (CORE)
- **Name**: Mutation scope safety
- **Role**: 선언된 경로 외의 임의 파일 변조 차단
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/mutation-guard.mjs` (current source)
- **Proof References**:
  - `mutation-guard`

### `workspace-fencing` (CORE)
- **Name**: Workspace fencing
- **Role**: 작업 공간 분리 및 외부 파일 유출 차단
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/git/staging-policy.mjs` (current source)
- **Proof References**:
  - `mutation-guard`

### `git-staging-safety` (HOST)
- **Name**: Git staging safety
- **Role**: Git 스테이징 정책 및 제외 파일 보호
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/git/staging-policy.mjs` (current source)
- **Proof References**:
  - `git-index-integrity`

### `git-commit` (HOST)
- **Name**: Git commit
- **Role**: 작업 문맥 기반 커밋 메시지 생성 및 로컬 커밋
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/git/closeout.mjs` (current source)
  - `schemas/kernel.git-closeout-receipt.schema.json` (current source)
  - `skills/commit-moonshot/SKILL.md` (current source)
  - `skills/kernel-commit/SKILL.md` (current source)
  - `skills/kernel-commit-closeout/SKILL.md` (current source)
- **Proof References**:
  - `git-closeout`

### `remote-parity` (OPTIONAL)
- **Name**: Remote parity
- **Role**: 원격 저장소 푸시 및 remote parity 검증
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/git/remote-parity.mjs` (current source)
- **Proof References**:
  - `git-closeout`


## Proof Tests
- **mutation-guard**: `tests/kernel-mutation-guard.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **git-closeout**: `tests/kernel-git-closeout.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **git-index-integrity**: `tests/kernel-git-closeout-index-integrity.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 신뢰 경계와 사용자 변경 보존을 동시에 지키는 현재 CORE capability다.
