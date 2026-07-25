# Kernel 단계별 모델 라우팅 구현

Date: 2026-07-25
Status: Implemented
Policy revision: `kernel-model-routing.v1`

Kernel이 현재 action에 필요한 **논리 모델 등급**을 결정하고 증거로 기록한다.
실제 provider 모델 해석과 실행은 Host가 담당하며, Kernel 코어에는 provider SDK·
엔드포인트·인증이 존재하지 않는다.

## 등급

| 등급 | 담당 |
| --- | --- |
| `frontier_reasoning` | understand / design / plan / replan / contract review / engineering review |
| `value_coding` | implement / debug / 테스트 작성 / 계획 범위 내 리팩터링 |
| `kernel` | prove / close — provider 모델을 요구하지 않음 |

`fast_utility` 같은 추가 등급은 V1 비목표다. 모델이 알아야 하는 개념 수를 늘리지 않는다.

## 우선순위

정체 → 계획 무효/아키텍처 이탈 → 재시도 임계 → protected obligation 실패 →
독립 리뷰 요구 → action 기본값. 이 순서는 `scripts/kernel/run/model-routing.mjs`에
고정되어 있고 `tests/kernel-model-route-contract.test.mjs`가 지킨다.

재시도 카운트는 **실패한 attempt 수**다. 시도 총수로 세면 재시도 임계(2)와 정체
임계(3)가 같은 턴에 걸리고, 정체가 우선하므로 재시도 승격이 도달 불가능해진다.

## 승격과 강등

승격은 동일 plan revision과 동일 obligation 안에서 유지된다(`ESCALATION_LOCKED`).
frontier가 재계획하면 새 plan revision이 생기고, 그 구현은 다시 `value_coding`으로
내려갈 수 있다. proof tier와 달리 모델 등급은 Run 전체 raise-only가 아니다.

## 경계

- 공개 명령은 여전히 `kernel next`와 `kernel report` 두 개뿐이다.
- 일반 `next` payload에는 모델 등급·라우팅 상태가 노출되지 않는다.
  Host 전용 정보는 `controlPlane.hostNext()`의 `hostDirective`로만 전달된다.
- 완료 권위는 Kernel의 hard evidence와 Completion decision에 그대로 남는다.
  가성비 모델이 구현했다는 사실은 완료 판정에 아무 영향을 주지 않는다.

## 관련 문서

- `01-host-model-config.ko.md`: Host 모델 매핑과 환경 변수 우선순위
- `02-evaluation-protocol.ko.md`: 평가 대상과 측정 불가 항목
