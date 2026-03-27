---
name: product-orchestrator
description: 요청이 아직 idea-to-plan 단계일 때, 구현 전에 경계가 있는 product-definition 산출물을 만들기 위해 사용합니다.
triggers:
  - "product orchestrator"
  - "product definition"
  - "intent to prd"
  - "idea to plan"
---

# Product Orchestrator

## 역할

코드 중심 Moonshot 실행 전에 제품 정의 워크플로우를 수행합니다.

요청이 아직 제품 범위를 잡는 단계라면 이 스킬이 Intake stage의 기본 공개 진입점입니다.

이 스킬은 아래 목적에 사용합니다.
- 아이디어를 제품 의도로 구조화
- 제품 의도를 PRD로 변환
- PRD를 제품 동작 모델로 구체화
- 동작 모델을 아키텍처로 변환
- 아키텍처를 실행 가능한 slice로 분해

이 스킬이 하지 않는 것:
- 시장 검증
- 사용자 인터뷰 자동화
- MVP 실험 파이프라인
- 직접 코드 구현

## 산출물 패키지

다음 경로 아래 산출물을 작성합니다.
- `{tasksRoot}/{feature-name}/product/`

필수 산출물:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `ADR/*.md`
- `PLAN.md`
- `tasks/*.md`
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

## 워크플로우

1. `PRODUCT_INTENT.md` 생성 또는 갱신
2. `PRODUCT_INTENT`에 대해 `product-gate-reviewer` 실행
3. `PRD.md` 생성 또는 갱신
4. `PRD`에 대해 `product-gate-reviewer` 실행
5. `SOLUTION.md` 생성 또는 갱신
6. `SOLUTION`에 대해 `product-gate-reviewer` 실행
7. `SPEC.md`와 필요한 `ADR/*.md` 생성 또는 갱신
8. `SPEC`에 대해 `product-gate-reviewer` 실행
9. `PLAN.md` 생성 또는 갱신
10. `task-slicer`로 `tasks/*.md` 생성
11. `PLAN`에 대해 `product-gate-reviewer` 실행
12. 결과 패키지를 `moonshot-orchestrator`로 핸드오프

모든 단계에서:
- 모호함 때문에 멈추기 전에 `assumption-ledger`를 먼저 사용
- 진짜 blocker가 아니면 멈추지 않음
- 초안 이후 최대 2회만 재작성

## 게이트 정책

모든 단계는 아래 중 하나로 끝납니다.
- `pass`: 다음 단계 진행 가능
- `conditional_pass`: 명시적 가정 또는 후속 메모와 함께 진행 가능
- `fail`: 현재 단계 재작성 필요

판정 규칙:
- 같은 지적이 두 번 반복되면 `conditional_pass`
- 중요하지만 치명적이지 않은 누락은 `ASSUMPTIONS.md`로 이동
- 필수 의존성 부재는 `BLOCKERS.md`로 이동

## 단계 요약

### PRODUCT_INTENT
- 문제 경계 고정
- 사용자 명시
- 핵심 가치 정의
- non-goal 고정

### PRD
- 시나리오와 acceptance 정의
- 문서를 제품 관점으로 유지
- 아키텍처 논의 금지

### SOLUTION
- 플로우, 상태, 엔티티, 예외 모델링
- 스택, 클래스, 모듈 논의 금지

### SPEC
- 동작 모델을 아키텍처로 번역
- 인터페이스, 컨테이너, 의존성, 비기능 요구 정리
- 주요 선택은 ADR에 기록

### EXECUTION_PLAN
- 아키텍처를 vertical slice로 변환
- 각 task를 독립 실행 가능하게 정리
- Moonshot direct handoff 준비

## 핸드오프 계약

PLAN이 통과되면:
- 문서 본문 전체가 아니라 경로를 전달
- assumptions와 blockers를 요약
- `tasks/*.md`를 구현 중심 워크플로우에 연결

권장 다음 단계:
- 생성된 제품 패키지와 함께 `/moonshot-orchestrator`

## 참고

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/`
- `.claude/skills/product-gate-reviewer/SKILL.md`
- `.claude/skills/task-slicer/SKILL.md`
- `.claude/skills/assumption-ledger/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
