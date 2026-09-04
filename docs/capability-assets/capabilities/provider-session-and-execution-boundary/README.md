# Provider session and execution boundary

- **ID**: `provider-session-and-execution-boundary`
- **Domain**: `EXECUTION`
- **Family Status**: `HOST`
- **Summary**: Host/provider session, execution capsule, workspace와 transport의 경계를 분리한다.

## Subcapabilities (Decomplexification 단위)
- **`host-session-binding`** [`HOST`]: Host/Provider 세션 식별 및 런타임 연결
- **`execution-capsule-transport`** [`HOST`]: 실행 캡슐 격리 및 transport 경계 보장
- **`step-worktree-isolation`** [`HOST`]: 스텝 단위 워크트리 생성 및 격리

## 해결하는 문제
- provider/host session과 Kernel task state가 섞이는 문제
- 실제 실행을 수행한 주체와 completion owner가 달라 증거가 불명확한 문제

## 해결하지 않는 문제
- provider login·quota·network availability
- 외부 host가 발행하지 않은 receipt를 추정하는 것

## 권장 사용
- session source, holder, execution capsule과 workspace를 별도 identity로 기록한다.
- host 실행 결과는 Kernel bound evidence로 반입한다.

## 금지 사용
- provider API 호출을 local unit test로 대체해 live success라 주장하지 않는다.
- auth/session secret을 asset manifest에 기록하지 않는다.

## 재도입 가이드
- **권장 레이어**: Host bridge and provider session adapter
- **트리거**: 새 provider, host surface 또는 execution transport를 추가할 때
- **통합 지점**:
  - capability admission
  - session binding
  - execution capsule
  - host receipt
- **위험 요소**:
  - auth leakage
  - provider state와 Kernel state의 split brain
  - fabricated execution proof
- **안전 가드레일**:
  - secret redaction
  - session/run identity binding
  - network policy
  - host-owned receipt required
