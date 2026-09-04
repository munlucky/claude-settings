# Step ledger and resume

- **ID**: `step-ledger-resume`
- **Domain**: `WORK`
- **Family Status**: `CORE`
- **Summary**: 실행 단계를 durable cursor와 lease로 기록하고 중단 후 안전하게 재개한다.

## Subcapabilities (Decomplexification 단위)
- **`run-step-ledger`** [`CORE`]: 단계별 순차 실행 상태 및 영속 원장 권위 유지
- **`work-cursor-resume`** [`CORE`]: 실행 커서 및 안전한 세션 재개 단일 권위

## 해결하는 문제
- 중단·재시작 시 어느 단계부터 이어야 하는지 잃는 문제
- 단계 완료와 실제 mutation을 혼동하는 문제

## 해결하지 않는 문제
- 손상된 외부 provider 세션 복구
- 실패한 설계 자체를 자동으로 올바르게 만드는 것

## 권장 사용
- step ledger에 current/next cursor와 attempt provenance를 남긴다.
- resume 전 workspace identity와 lease를 확인한다.

## 금지 사용
- cursor를 초기화하려고 계약을 재발행하지 않는다.
- ledger를 completion receipt의 대체물로 사용하지 않는다.

## 재도입 가이드
- **권장 레이어**: Kernel run state
- **트리거**: 새 단계형 workflow 또는 recoverable execution이 필요할 때
- **통합 지점**:
  - run-step-ledger
  - step planner
  - resume view
  - workspace lease
- **위험 요소**:
  - 새 phase abstraction이 step ledger와 중복될 위험
  - stale cursor로 재개할 위험
- **안전 가드레일**:
  - step ID와 attempt를 immutable하게 기록
  - resume 전 identity/lease 검증
  - completion은 fresh proof로만 닫음
