# Control plane state authority

- **ID**: `control-plane-state-authority`
- **Domain**: `EXECUTION`
- **Family Status**: `CORE`
- **Summary**: run, workflow, state projection과 durable repository의 권위를 단일 Kernel control plane으로 조정한다.

## Subcapabilities (Decomplexification 단위)
- **`state-transition-authority`** [`CORE`]: 런타임 라이프사이클 상태 전이 단일 권위
- **`minimal-durable-state`** [`CORE`]: SQLite 어댑터 기반 실행 상태 영속화 및 투영

## 해결하는 문제
- run state와 projection이 서로 다른 lifecycle을 나타내는 문제
- 각 adapter가 독자적으로 completion을 선언하는 문제

## 해결하지 않는 문제
- provider 실행의 내부 state
- 사용자 product state의 business workflow

## 권장 사용
- state mutation은 control plane과 durable repository를 통과시킨다.
- projection은 source state의 read model로만 취급한다.

## 금지 사용
- projection/로그를 authoritative state로 쓰지 않는다.
- Relay switcher나 별도 runtime을 Kernel control plane에 병합하지 않는다.

## 재도입 가이드
- **권장 레이어**: Kernel control plane
- **트리거**: 새 lifecycle state, transition 또는 completion surface를 추가할 때
- **통합 지점**:
  - task/run identity
  - state transition
  - proof outcome
  - finalization
- **위험 요소**:
  - 새 adapter가 별도 state authority가 될 위험
  - projection을 source로 역사용할 위험
- **안전 가드레일**:
  - single source of truth
  - schema + transition tests
  - receipt-backed finalization
