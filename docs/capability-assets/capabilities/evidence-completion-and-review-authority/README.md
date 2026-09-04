# Evidence, completion, and review authority

- **ID**: `evidence-completion-and-review-authority`
- **Category**: `TRUST`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
실행 증거와 review receipt를 completion gate에 연결해 서술과 실제 실행을 분리한다.

## Subcapabilities Traceability
### `evidence-binding` (CORE)
- **Name**: Evidence binding
- **Role**: 실증 증거 수집 및 인수조건 의무 바인딩
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/evidence-pack.mjs` (current source)
  - `schemas/kernel.release-evidence.schema.json` (current source)
  - `skills/browser-verifier/SKILL.md` (current source)
  - `skills/verification-evidence-gate/SKILL.md` (current source)
- **Proof References**:
  - `completion-evidence`

### `verification-authority` (CORE)
- **Name**: Verification authority
- **Role**: 검증 실행 결과 평가 및 통과 여부 단일 권위
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/proof/proof-executor.mjs` (current source)
  - `skills/completion-verifier/SKILL.md` (current source)
  - `skills/failure-analyzer/SKILL.md` (current source)
  - `skills/verification-contract-gate/SKILL.md` (current source)
  - `.claude/skills/completion-verifier/SKILL.md` (historical commit: `5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`)
- **Proof References**:
  - `completion-evidence`

### `completion-decision` (CORE)
- **Name**: Completion decision
- **Role**: 최종 완료 판정 및 릴리즈 승인 게이트
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/run/finalization.mjs` (current source)
- **Proof References**:
  - `completion-evidence`

### `protected-obligation` (CORE)
- **Name**: Protected obligation
- **Role**: 고위험 변경에 대한 필수 검증 의무 강제
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/evidence-pack.mjs` (current source)
- **Proof References**:
  - `kernel-evidence-pack`

### `independent-reviewer-execution` (OPTIONAL)
- **Name**: Independent reviewer execution
- **Role**: 독립 컨텍스트 리뷰어 실행 및 판정 도출
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/proof/review-receipt.mjs` (current source)
  - `skills/plan-ceo-review/SKILL.md` (current source)
  - `skills/plan-eng-review/SKILL.md` (current source)
- **Proof References**:
  - `review-receipt-completion`

### `review-transport` (HOST)
- **Name**: Review transport
- **Role**: 외부 리뷰어 세션 브릿지 및 프로토콜 전송
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `schemas/kernel.review-receipt.schema.json` (current source)
  - `scripts/kernel/proof/review-receipt.mjs` (current source)
- **Proof References**:
  - `review-receipt-completion`


## Proof Tests
- **completion-evidence**: `tests/completion-evidence.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **kernel-evidence-pack**: `tests/kernel-evidence-pack.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **review-receipt-completion**: `tests/kernel-review-receipt-completion.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 신뢰 가능한 agent workflow의 핵심 completion boundary이므로 CORE로 유지한다.
