# Harness surface and regression audit

- **ID**: `harness-surface-and-regression-audit`
- **Category**: `TRUST`
- **Status**: `REFERENCE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
tracked surface, tests, budget와 regression signal을 진단해 검증 범위 drift를 드러낸다.

## Subcapabilities Traceability
### `harness-surface-budget` (REFERENCE)
- **Name**: Harness surface budget
- **Role**: 저장소 파일/라인/토큰 표면 예산 측정
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/harness-surface-report.mjs` (current source)
  - `package/harness-surface-budget.json` (current source)
- **Proof References**:
  - `surface-report`

### `regression-audit-reporting` (REFERENCE)
- **Name**: Regression audit reporting
- **Role**: 미등록 테스트 탐지 및 회귀 보고
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `tests/harness-surface-report-contract.test.mjs` (current source)
  - `tests/harness-regression-contract.test.mjs` (current source)
  - `tests/harness-history-contract.test.mjs` (current source)
- **Proof References**:
  - `harness-regression`
  - `harness-history`


## Proof Tests
- **surface-report**: `tests/harness-surface-report-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `executed-pass`) — command: `test`
- **harness-regression**: `tests/harness-regression-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **harness-history**: `tests/harness-history-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 자산화 자체와 future decomplexification에서 surface drift를 관찰하는 REFERENCE capability로 유지한다.
