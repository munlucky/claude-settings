# Retrospective and regression learning

- **ID**: `retrospective-and-regression-learning`
- **Category**: `KNOWLEDGE`
- **Status**: `OPTIONAL`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
실패·회고 signal을 수집하고 regression candidate로 만들되 명시적 review 전에는 authority로 승격하지 않는다.

## Subcapabilities Traceability
### `daily-retro-collection` (OPTIONAL)
- **Name**: Daily retro collection
- **Role**: 일일 회고 및 장애 신호 수집
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/knowledge-improvement-lifecycle.mjs` (current source)
  - `skills/moonshot-retro/SKILL.md` (current source)
  - `skills/session-logger/SKILL.md` (current source)
- **Proof References**:
  - `retro-collect`
  - `retro-redaction`

### `improvement-proposals` (OPTIONAL)
- **Name**: Improvement proposals
- **Role**: 회고 기반 개선 제안 및 이슈 초안 작성
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/awtl-memory-promotion.mjs` (current source)
- **Proof References**:
  - `retro-no-promotion`


## Proof Tests
- **retro-collect**: `tests/retro-collect-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **retro-redaction**: `tests/retro-redaction-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **retro-no-promotion**: `tests/retro-no-promotion-authority-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 반복 실패를 잊지 않게 하는 OPTIONAL learning asset이지만 runtime 권위와 분리한다.
