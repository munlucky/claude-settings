# Capability Decisions: Model routing and route admission

- **Capability ID**: `model-routing-and-route-admission`
- **Disposition**: `retain`
- **Subcapabilities Count**: 6

## Rationale
현재 multi-stage Kernel의 선택과 비용·위험 경계를 담당하는 CORE capability다.

## Subcapabilities Allocation
- **Required capability contract** (`required-capability-contract`): `CORE` — 작업별 필수 역량 조건 선언 및 검증 계약
  - Implementations: 1 files bound
  - Proofs: route-admission
- **Route admission** (`route-admission`): `CORE` — 실행 전 라우트 안전성 승인 및 드리프트 방지
  - Implementations: 1 files bound
  - Proofs: route-admission
- **Model selection** (`model-selection`): `HOST` — 논리 모델 클래스(Fast/Standard/Deep) 매핑
  - Implementations: 1 files bound
  - Proofs: model-routing-e2e
- **Provider selection** (`provider-selection`): `HOST` — 실제 Provider 디스패치 및 런처 실행
  - Implementations: 1 files bound
  - Proofs: model-routing-e2e
- **Effort and cost routing** (`effort-cost-routing`): `HOST` — 추론 노력(Effort) 및 토큰 비용 최적화
  - Implementations: 1 files bound
  - Proofs: model-routing-e2e
- **Stagnation escalation** (`stagnation-escalation`): `OPTIONAL` — 진행 정체 감지 시 상위 모델/경로로 에스컬레이션
  - Implementations: 1 files bound
  - Proofs: stagnation-routing

## Follow-up Directives
- 새 route는 benchmark보다 먼저 admission invariant와 failure boundary를 추가한다.
