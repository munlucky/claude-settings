# Product Definition Workflow

> 구현 전에 요청이 제품 정의 단계에 있을 때 사용하는 워크플로우입니다.

## 목표

시장 검증, 인터뷰, MVP 실험 자동화로 넓히지 않고, 원시 아이디어를 구현 준비 산출물로 압축합니다.

이 워크플로우는 "만들 준비가 된 상태"에서 멈춥니다.

1. 제품 의도가 경계와 함께 고정된다.
2. 제품 요구사항이 구체화된다.
3. 제품 동작 모델이 정리된다.
4. 아키텍처가 정의된다.
5. 작업이 독립 실행 가능한 단위로 분해된다.
6. downstream 구현이 `PLAN.md`를 추측으로 해석하지 않고 테스트 가능한 `Sprint Contract`로 바로 연결될 수 있다.

## 단계 공통 계약

모든 단계는 같은 루프를 따릅니다.

1. 작성
2. 비평
3. 수정
4. 게이트 판정: `pass`, `conditional_pass`, `fail`

가드레일:
- 단계별 재작성 예산: 초안 이후 최대 2회
- 안전한 진행이 불가능한 blocker가 아니면 사용자 질문으로 멈추지 않음
- 같은 지적이 2회 반복되면 `conditional_pass`
- 수정은 추측성 스코프 추가가 아니라 누락 제거 방향이어야 함

## 단계

### 1. PRODUCT_INTENT

산출물:
- `{tasksRoot}/{feature-name}/product/PRODUCT_INTENT.md`

필수 섹션:
- 문제
- 대상 사용자
- 핵심 가치
- 제외 범위
- 제약조건
- 성공 상태 한 줄 정의

게이트:
- "무엇을 만들지"뿐 아니라 "무엇을 만들지 않을지"까지 명확해야 함

### 2. PRD

산출물:
- `{tasksRoot}/{feature-name}/product/PRD.md`

필수 섹션:
- 사용자 시나리오
- 핵심 기능
- 제품 관점 비기능 요구
- Out of scope
- Acceptance criteria

게이트:
- PM이 읽어도 이해되고, 개발자 질문이 크게 남지 않아야 함

### 3. SOLUTION

산출물:
- `{tasksRoot}/{feature-name}/product/SOLUTION.md`

필수 섹션:
- 주요 유저 플로우
- 화면 또는 상태 전이
- 엔티티 개요
- 예외 흐름
- 운영 시나리오

규칙:
- 기술 스택 선택 금지
- 클래스/모듈 구조 금지
- 코드 구조 논의 금지

게이트:
- 코드 언급 없이도 제품 동작 모델을 설명할 수 있어야 함

### 4. SPEC

산출물:
- `{tasksRoot}/{feature-name}/product/SPEC.md`
- `{tasksRoot}/{feature-name}/product/ADR/*.md`

필수 섹션:
- 시스템 컨텍스트
- 주요 컨테이너
- 데이터 흐름
- 외부 의존성
- 보안/신뢰성/성능 제약
- 아키텍처 결정

게이트:
- 구현 중 임의 해석 여지가 적을 만큼 선택이 명시적이어야 함

### 5. EXECUTION_PLAN

산출물:
- `{tasksRoot}/{feature-name}/product/PLAN.md`
- `{tasksRoot}/{feature-name}/product/tasks/*.md`

필수 섹션:
- Vertical slice 분해
- 병렬 실행 그룹
- 의존성
- 완료 조건
- 검증 전략
- 롤백 또는 영향 범위
- downstream 구현용 contract seed

게이트:
- 각 task가 숨은 맥락 없이 구현 워크플로우로 바로 넘어갈 수 있어야 함
- 각 task만 읽어도 downstream 에이전트가 제품 동작을 새로 상상하지 않고 `SPRINT_CONTRACT.md`를 작성할 수 있어야 함

### 6. BUILD

이 단계는 downstream handoff만 담당합니다.

PLAN 통과 후에는 기존 Moonshot 실행 워크플로우를 사용합니다.

## Assumptions와 Blockers

모든 모호함을 중단 사유로 취급하지 않습니다.

미해결 항목은 아래 문서에 적재합니다.
- Assumptions: `{tasksRoot}/{feature-name}/product/ASSUMPTIONS.md`
- Blockers: `{tasksRoot}/{feature-name}/product/BLOCKERS.md`

규칙:
- 치명적이지 않은 모호함은 `ASSUMPTIONS.md`로 이동
- 단계 통과를 막는 항목만 `BLOCKERS.md`에 남김
- 대화 중단보다 명시적 가정 하 진행을 우선

## Task 분해 규칙

`product/tasks/*.md`의 각 task는 반드시 포함해야 합니다.
- 입력
- 출력
- 완료 조건
- 영향 범위
- 선행 의존성
- 병렬 가능 여부
- 검증 방법
- evaluator가 특히 봐야 할 포인트

레이어 단위보다 vertical slice를 우선합니다.

좋은 예:
- "온보딩 초안 저장 플로우 end-to-end 구현"

피해야 할 예:
- "DTO 작성"
- "repository layer 추가"
- "UI shell만 구현"

## Execution Bridge 아티팩트

제품 정의 워크플로우는 코드 작성 전에 멈추지만, downstream build는 `PLAN.md`에서 바로 코드로 점프하지 말고 브리지 문서부터 작성해야 합니다.

slice별 권장 아티팩트:
- `SPRINT_CONTRACT.md`: 이번 라운드 목표, non-goal, done check, 검증 방법
- `QA_REPORT.md`: evaluator 판정, 실패 기준, 재현 메모, 다음 라운드 피드백
- `HANDOFF.md`: 장시간 작업이나 중단된 세션의 재개 상태

권장 위치:
- `{tasksRoot}/{feature-name}/execution/{slice-name}/`

medium/complex 작업에서는 `PLAN.md`와 각 task 문서가 이 브리지 문서를 무리 없이 시작할 수 있을 정도로 구체적이어야 합니다.

## Moonshot 핸드오프 계약

`product-orchestrator`는 upstream입니다.
`moonshot-orchestrator`는 계속 build control plane 역할을 맡습니다.

핸드오프 패키지:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

Moonshot에는 문서 전체 본문이 아니라 경로와 요약만 넘깁니다.

## 템플릿

`.claude/templates/product-definition/`의 템플릿을 사용합니다.
- `PRODUCT_INTENT.template.md`
- `PRD.template.md`
- `SOLUTION.template.md`
- `SPEC.template.md`
- `ADR.template.md`
- `PLAN.template.md`
- `task.template.md`
- `ASSUMPTIONS.template.md`
- `BLOCKERS.template.md`

downstream 실행 아티팩트는 아래 템플릿도 함께 사용합니다.
- `.claude/templates/execution/SPRINT_CONTRACT.template.md`
- `.claude/templates/execution/QA_REPORT.template.md`
- `.claude/templates/execution/HANDOFF.template.md`
