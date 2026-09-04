# Knowledge ingestion and evidence graph

- **ID**: `knowledge-ingestion-and-evidence-graph`
- **Category**: `KNOWLEDGE`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
외부·과거 signal을 redact, normalize, deduplicate하고 evidence-bound knowledge candidate로 만든다.

## Subcapabilities Traceability
### `knowledge-ingestion-normalization` (CORE)
- **Name**: Knowledge ingestion normalization
- **Role**: 지식 수집, 정규화, 중복 제거 및 충돌 검사
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/knowledge-ingestion/candidate-extract.mjs` (current source)
  - `scripts/kernel/knowledge-ingestion/redact.mjs` (current source)
  - `scripts/kernel/knowledge-ingestion/normalize.mjs` (current source)
  - `scripts/kernel/knowledge-ingestion/deduplicate.mjs` (current source)
- **Proof References**:
  - `knowledge-candidate`

### `ontology-gate-promotion` (CORE)
- **Name**: Ontology gate promotion
- **Role**: 온톨로지 제약 평가 및 프로젝트 지식 승격
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/knowledge-ingestion/conflict.mjs` (current source)
  - `scripts/kernel/knowledge-ingestion/transaction.mjs` (current source)
  - `scripts/kernel/knowledge-ingestion/verify.mjs` (current source)
  - `scripts/kernel/knowledge/evidence-binder.mjs` (current source)
  - `scripts/kernel/knowledge/candidate-review.mjs` (current source)
- **Proof References**:
  - `knowledge-store`
  - `knowledge-lifecycle`


## Proof Tests
- **knowledge-candidate**: `tests/kernel-knowledge-candidate.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **knowledge-store**: `tests/kernel-knowledge-store.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **knowledge-lifecycle**: `tests/kernel-knowledge-lifecycle-e2e.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 프로젝트 지식 lifecycle과 failure learning을 안전하게 연결하는 현재 CORE capability다.
