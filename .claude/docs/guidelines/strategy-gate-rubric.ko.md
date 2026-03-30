# Strategy Gate Rubric

> planning 단계 전략 게이트를 위한 durable 판단 기준입니다.

Last-Reviewed: 2026-03-30

## 목적

구현에 들어가기 전에 작업을 진행할지, 축소할지, 보류할지, 실패 처리할지를 결정하는 planning 단계 리뷰 스킬에 이 기준을 사용합니다.

이 문서는 다음의 durable source입니다.

- `plan-ceo-review`
- `plan-eng-review`

하네스 탐색 작업 문서에만 있던 판단 규칙을 여기로 승격합니다.

## 게이트 분리

### CEO Gate

제품 가치, 타이밍, 범위 통제를 검토할 때 사용합니다.

핵심 질문:

1. 왜 지금 이 작업을 해야 하는가?
2. 이것이 배포되면 어떤 사용자 가치가 생기는가?
3. 무엇이 명시적으로 out of scope인가?
4. 비용이 근시일 가치로 정당화되는가?
5. 실행 전에 범위를 줄여야 하는가?

기본 편향:

- 추측성 확장보다 scope reduction을 우선
- 넓은 선택 기능 집합보다 명확한 core path를 우선
- 관측성, 롤아웃 안전성, 지원 부담도 scope cost의 일부로 간주

### ENG Gate

아키텍처 무결성, 의존성 명확성, 실행 준비성을 검토할 때 사용합니다.

핵심 질문:

1. 책임 경계가 명시적인가?
2. 의존 순서와 소유권이 분명한가?
3. 계획된 작업의 verification이 정의돼 있는가?
4. 구현 중 숨은 발명을 피하고 있는가?
5. 기술 리스크가 과한 범위에서 오는가?

기본 편향:

- 실행 중 큰 설계 발명이 필요한 계획은 거절
- 암묵적 조율보다 명시적 인터페이스를 우선
- 기술 리스크가 breadth-driven이면 scope reduction을 우선

## Verdict 의미

반환값은 아래 중 정확히 하나입니다.

- `pass`: 큰 수정 없이 실행 가능하고 정당화 가능함
- `conditional_pass`: 제한된 보완 후에만 진행 가능
- `scope_reduction`: 실행 전에 범위를 줄여야 함
- `hold_scope`: 타이밍, 가치, 준비성을 다시 평가해야 함
- `fail`: 현재 형태로는 진행하면 안 됨

## 판단 규칙

- 완성도만으로는 충분하지 않습니다. 계획이 완성돼 보여도 가치나 준비성에서 실패할 수 있습니다.
- verification이 빠진 구현 지향 계획에는 `pass`를 주지 않습니다.
- non-goal이 없으면 가치 검토가 끝난 것이 아닙니다.
- 숨은 결합이나 미정 소유권은 verdict를 낮춰야 합니다.
- 불확실성을 범위 축소로 제거할 수 있으면 `fail`보다 `scope_reduction`을 먼저 사용합니다.
- 범위를 줄여도 핵심 근거가 약하면 `hold_scope` 또는 `fail`을 사용합니다.

## 아티팩트 기대치

### CEO Gate 대상 아티팩트

- `PRODUCT_INTENT.md`
- `PRD.md`
- `PLAN.md`
- 선택: `ASSUMPTIONS.md`, `BLOCKERS.md`

최소 신호:

- 명확한 문제와 대상 사용자
- 명시적 non-goals
- 비용 대비 가치 논리
- 한 줄 성공 상태

### ENG Gate 대상 아티팩트

- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`

최소 신호:

- 명시적 경계와 소유자
- 순서와 의존성
- verification 명령 또는 증거 경로
- 필요 시 rollback 또는 blast radius 인식

## 출력 계약

리뷰 결과는 짧고 실행 가능해야 합니다.

- `artifact`
- `verdict`
- `summary`
- `requiredChanges`
- `assumptions`
- `blockers`

## 참고

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/verification-contract.md`
