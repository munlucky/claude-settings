# Model routing and route admission

- **ID**: `model-routing-and-route-admission`
- **Domain**: `INTELLIGENCE`
- **Status**: `CORE`
- **Summary**: stage, capability, risk, cost와 provider policy를 고려해 실행 route를 admission한다.

## 해결하는 문제
- 모든 stage를 같은 모델/provider로 실행하는 비효율
- capability·risk·evidence 조건을 확인하지 않은 route 선택

## 해결하지 않는 문제
- 모델의 실제 품질을 보장하는 것
- provider quota나 인증 장애를 해결하는 것

## 권장 사용
- route 입력에 stage, capability, risk와 budget을 명시한다.
- admission 결과와 model usage receipt를 evidence로 연결한다.

## 금지 사용
- route preference를 completion authority로 사용하지 않는다.
- stagnation이나 failure를 감추기 위해 route를 임의로 재시도하지 않는다.

## 재도입 가이드
- **권장 레이어**: route admission before Host execution
- **트리거**: 새 model class, provider capability 또는 stage policy를 추가할 때
- **통합 지점**:
  - capability resolver
  - route policy
  - provider session
  - usage receipt
- **위험 요소**:
  - cost/risk policy bypass
  - provider mismatch
  - silent retry loop
  - routing as authority confusion
- **안전 가드레일**:
  - schema-bound route
  - admission gate
  - usage receipt
  - stagnation cap
  - fresh evidence
