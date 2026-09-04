# Model routing and route admission

- **ID**: `model-routing-and-route-admission`
- **Category**: `INTELLIGENCE`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
stage, capability, risk, cost와 provider policy를 고려해 실행 route를 admission한다.

## Subcapabilities Traceability
### `required-capability-contract` (CORE)
- **Name**: Required capability contract
- **Role**: 작업별 필수 역량 조건 선언 및 검증 계약
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/model-route-contract.mjs` (current source)
- **Proof References**:
  - `route-admission`

### `route-admission` (CORE)
- **Name**: Route admission
- **Role**: 실행 전 라우트 안전성 승인 및 드리프트 방지
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/routing/route-admission.mjs` (current source)
- **Proof References**:
  - `route-admission`

### `model-selection` (HOST)
- **Name**: Model selection
- **Role**: 논리 모델 클래스(Fast/Standard/Deep) 매핑
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/model-routing.mjs` (current source)
- **Proof References**:
  - `model-routing-e2e`

### `provider-selection` (HOST)
- **Name**: Provider selection
- **Role**: 실제 Provider 디스패치 및 런처 실행
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/capability-resolver.mjs` (current source)
- **Proof References**:
  - `model-routing-e2e`

### `effort-cost-routing` (HOST)
- **Name**: Effort and cost routing
- **Role**: 추론 노력(Effort) 및 토큰 비용 최적화
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/model-routing.mjs` (current source)
- **Proof References**:
  - `model-routing-e2e`

### `stagnation-escalation` (OPTIONAL)
- **Name**: Stagnation escalation
- **Role**: 진행 정체 감지 시 상위 모델/경로로 에스컬레이션
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/stagnation.mjs` (current source)
- **Proof References**:
  - `stagnation-routing`


## Proof Tests
- **model-routing-e2e**: `tests/kernel-model-routing-e2e.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **route-admission**: `tests/kernel-route-admission.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **stagnation-routing**: `tests/kernel-stagnation-routing.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 현재 multi-stage Kernel의 선택과 비용·위험 경계를 담당하는 CORE capability다.
