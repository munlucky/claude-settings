# Context, prompt, cache, and optimization

- **ID**: `context-prompt-cache-and-optimization`
- **Category**: `OPTIMIZATION`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
bounded context, redaction, prompt envelope, stable cache와 optimization evidence를 관리한다.

## Subcapabilities Traceability
### `context-build` (CORE)
- **Name**: Context build
- **Role**: 제한된 문맥 빌드 및 민감 정보 마스킹
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/context-build.mjs` (current source)
  - `scripts/kernel/context-segments.mjs` (current source)
- **Proof References**:
  - `context-compiler`

### `knowledge-context-selection` (CORE)
- **Name**: Knowledge context selection
- **Role**: 프로젝트 지식 선별 및 주입
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/context-build.mjs` (current source)
  - `scripts/kernel/context-segments.mjs` (current source)
- **Proof References**:
  - `context-compiler`

### `context-receipt-freshness` (CORE)
- **Name**: Context receipt freshness
- **Role**: 문맥 바이트 영수증 및 신선도 검증
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/context-receipt.mjs` (current source)
- **Proof References**:
  - `context-byte-identity`

### `prompt-envelope` (HOST)
- **Name**: Prompt envelope
- **Role**: Provider별 프롬프트 와이어 포맷 정규화
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/context-segments.mjs` (current source)
  - `scripts/kernel/canonical-digest.mjs` (current source)
- **Proof References**:
  - `context-byte-identity`

### `prompt-cache` (HOST)
- **Name**: Prompt cache
- **Role**: Provider 프롬프트 캐시 브레이크포인트 최적화
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/cache-replay.mjs` (current source)
- **Proof References**:
  - `cache-replay`

### `optimization-cycle` (OPTIONAL)
- **Name**: Optimization cycle
- **Role**: 캐시 재생 및 토큰 절감 지표 측정 루프
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/optimization-cycle.mjs` (current source)
  - `scripts/kernel/canonical-digest.mjs` (current source)
- **Proof References**:
  - `cache-replay`


## Proof Tests
- **context-compiler**: `tests/kernel-context-compiler.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **context-byte-identity**: `tests/kernel-context-byte-identity.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **cache-replay**: `tests/kernel-cache-replay.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 비용과 재현성을 함께 다루는 현재 CORE capability이며 knowledge와 evidence boundary를 보강한다.
