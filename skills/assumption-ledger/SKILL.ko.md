---
name: assumption-ledger
description: 모호함을 가정 또는 blocker로 기록해 워크플로우를 멈추지 않고 계속 진행하게 합니다.
---

# Assumption Ledger

## 역할

미해결 모호함을 기록하되 워크플로우를 멈추지 않게 합니다.

기록 대상:
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

## 판정 정책

다음 경우 `ASSUMPTIONS.md`에 기록합니다.
- 진행이 여전히 안전함
- 모호함이 핵심 범위가 아니라 세부 수준에 머묾
- 명시적 메모만 있으면 다음 단계 진행 가능

다음 경우 `BLOCKERS.md`에 기록합니다.
- 현재 단계가 안전하게 통과할 수 없음
- 누락된 의존성이 아키텍처 또는 실행 계획 수립을 막음
- 계속 진행하면 중요한 결정을 임의 추측해야 함

## 규칙

- 명시적 가정과 함께 전진을 우선
- blocker는 짧고 실행 가능하게 작성
- 같은 항목을 두 파일에 중복 기록하지 않음
- 가정이 해소되거나 blocker가 제거되면 상태를 갱신

## 권장 필드

Assumption 항목:
- Stage
- Assumption
- Reason
- Owner
- Status

Blocker 항목:
- Stage
- Blocker
- Why it blocks
- Unblock path
- Status

## 참고

- `docs/public/guidelines/product-definition-workflow.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/ASSUMPTIONS.template.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/BLOCKERS.template.md`
