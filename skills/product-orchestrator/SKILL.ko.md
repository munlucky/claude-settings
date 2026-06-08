---
name: product-orchestrator
description: 요청이 아직 idea-to-plan 단계일 때, 구현 전에 경계가 있는 product-definition 산출물을 만들기 위해 사용합니다.
layer: orchestrator
loads:
  - product-definition-artifacts
  - verdict-summaries
deepReferences:
  - docs/public/guidelines/product-definition-workflow.md
  - docs/public/guidelines/requirements-traceability-harness.md
  - docs/public/guidelines/demo-first-mvp-gate.md
  - docs/public/guidelines/external-skill-pattern-transfer.md
  - docs/public/guidelines/memorygraph-workflow.ko.md
outputArtifacts:
  - PRODUCT_INTENT.md
  - PRD.md
  - SOLUTION.md
  - SPEC.md
  - PLAN.md
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

`demo_first` MVP execution pack은 준비할 수 있습니다. 이 pack은 planning/execution contract이며 market experiment runner가 아닙니다.

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

조건부 demo-first MVP 산출물:
- `MVP_SCOPE.md`
- `MINI_ARCHITECTURE.md`
- `UI_DEMO_PLAN.md`
- `UI_FLOW_MAP.md`
- `UI_STATE_MATRIX.md`
- `MOCK_SCENARIOS.md`
- `MOCK_API_CONTRACT.md`
- `USER_DEMO_TEST.md`
- `DEMO_EVIDENCE.md`
- `USER_DEMO_APPROVAL.md`
- `POST_DEMO_IMPLEMENTATION_PLAN.md`
- `UI_CHANGE_REQUEST.md`

계획 문서에는 아래 가치 판단 정보도 남긴다.
- 명시적 non-goal
- 요청 범위가 크면 scope reduction 또는 hold scope 메모
- `PRODUCT_INTENT`, `PRD`, `PLAN` 단계의 짧은 cost/benefit 근거

## 워크플로우

0. `projectKnowledgeContext`를 `stage=intake`, `strictness=advisory`로 만들고 typed summary block/status metadata만 병합
1. `PRODUCT_INTENT.md` 생성 또는 갱신
2. 각 reviewer/planning task를 넘기기 전에 직전 산출물이 scope, 용어, architecture를 바꿨다면 현재 stage(`plan`)의 `projectKnowledgeContext`를 갱신
3. `PRODUCT_INTENT`에 대해 `product-gate-reviewer` 실행
4. `PRODUCT_INTENT`에 대해 `plan-ceo-review` 실행
5. `PRD.md` 생성 또는 갱신
6. `PRD`에 대해 `product-gate-reviewer` 실행
7. `PRD`에 대해 `plan-ceo-review` 실행
8. `SOLUTION.md` 생성 또는 갱신
9. `SOLUTION`에 대해 `product-gate-reviewer` 실행
10. `SPEC.md`와 필요한 `ADR/*.md` 생성 또는 갱신
11. `SPEC`에 대해 `product-gate-reviewer` 실행
12. `SPEC`에 대해 `plan-eng-review` 실행
13. `PLAN.md` 생성 또는 갱신
14. `task-slicer`로 `tasks/*.md` 생성
15. `PLAN`에 대해 `product-gate-reviewer` 실행
16. `PLAN`에 대해 `plan-ceo-review` 실행
17. `PLAN`에 대해 `plan-eng-review` 실행
18. `projectKnowledgeContext`와 함께 `moonshot-orchestrator`로 handoff

모든 단계:
- `docs/public/guidelines/memorygraph-workflow.ko.md`를 적용합니다.
- `.moonshot-relay/docs/ko/`를 MemoryGraph 소스로 사용하지 않습니다.
- system/developer/AGENTS/rules 정책과 중복되는 MemoryGraph 결과는 병합하지 않습니다.

모든 단계에서:
- 모호함 때문에 멈추기 전에 `assumption-ledger`를 먼저 사용
- 진짜 blocker가 아니면 멈추지 않음
- 초안 이후 최대 2회만 재작성
- 가치가 약하거나 불명확하면 추측성 확장보다 scope reduction 을 우선함

## 게이트 정책

모든 단계는 아래 중 하나로 끝납니다.
- `pass`: 다음 단계 진행 가능
- `conditional_pass`: 명시적 가정 또는 후속 메모와 함께 진행 가능
- `fail`: 현재 단계 재작성 필요

판정 규칙:
- 같은 지적이 두 번 반복되면 `conditional_pass`
- 중요하지만 치명적이지 않은 누락은 `ASSUMPTIONS.md`로 이동
- 필수 의존성 부재는 `BLOCKERS.md`로 이동
- 가치가 약하거나 cost/benefit 가 방어되지 않으면 scope reduction, hold scope, 또는 fail 처리

## 가치 판단 정책

completeness 만으로 충분하다고 보지 않는다.

execution 으로 넘기기 전 planning package 는 아래에 답해야 한다.
- 왜 지금 중요한가
- 무엇을 만들지 않을 것인가
- 예상 구현 비용 대비 효익이 충분한가
- execution 전에 scope 를 줄여야 하는가

권장 액션:
- `scope_reduction`
- `hold_scope`
- `fail`

## 단계 요약

### PRODUCT_INTENT
- 문제 경계 고정
- 사용자 명시
- 핵심 가치 정의
- non-goal 고정
- 왜 지금 필요한지 기록

### PRD
- 시나리오와 acceptance 정의
- 문서를 제품 관점으로 유지
- 아키텍처 논의 금지
- 기능을 가치 순서대로 우선순위화

### SOLUTION
- 플로우, 상태, 엔티티, 예외 모델링
- 스택, 클래스, 모듈 논의 금지

### SPEC
- 동작 모델을 아키텍처로 번역
- 인터페이스, 컨테이너, 의존성, 비기능 요구 정리
- 주요 선택은 ADR에 기록
- architecture-heavy PRD는 최종 `PLAN.md` 전에 `moonshot-architecture`로 라우팅합니다. 반환된 architecture package path를 사용하고 architecture decision을 inline으로 다시 쓰지 않습니다.

### EXECUTION_PLAN
- 아키텍처를 vertical slice로 변환
- 각 task를 독립 실행 가능하게 정리
- Moonshot direct handoff 준비
- 가치 대비 비용이 약한 slice 는 축소하거나 거절
- 사용자 직접 검증이 필요한 user-facing MVP 작업은 `mvpMethodology.profile: demo_first`를 설정하고 `PLAN.md`와 `tasks/*.md`에 Demo Approval Hard Stop을 보존합니다.
- demo-first plan은 각 in-scope slice를 `demo_ready_ui -> mock_functional_demo -> demo_evidence_capture -> user_demo_approval -> real_functional -> real_functional_verification -> production_hardening` 순서로 진행해야 합니다.
- 승인 전에는 mock contract, typed fixture, mock handler, in-memory state, localStorage demo persistence를 허용하고 production backend, real persistence, auth integration, irreversible migration, production job, production payment workflow는 차단합니다.
- `USER_DEMO_APPROVAL.md`를 approval truth source로, `DEMO_EVIDENCE.md`를 사용자가 승인한 범위의 evidence source로 취급합니다.

## 승인 경계

- human approval 은 execution 시작 전 planning package 승인에만 사용할 수 있다.
- execution 이 시작된 뒤에는 true blocker 나 외부 의존성이 없는 한 implementation -> review -> verify -> retry loop 에 human checkpoint 를 추가하지 않는다.
- 예외: `demo_first` MVP 작업은 Mock Functional Demo evidence 뒤 `USER_DEMO_APPROVAL.md`가 non-empty approved scope로 승인될 때까지 hard-stop해야 합니다.

## 핸드오프 계약

PLAN이 통과되면:
- 문서 본문 전체가 아니라 경로를 전달
- assumptions와 blockers를 요약
- `moonshot-architecture`를 사용했다면 `REQUIREMENT_INVENTORY.md`, `ASR_CATALOG.md`, `TRACEABILITY_MATRIX.md`, 선택된 `ADR/*.md`, `ARCHITECTURE_REVIEW.md` path를 포함
- `tasks/*.md`를 구현 중심 워크플로우에 연결
- bounded implementation은 `moonshot-orchestrator`로, multi-phase/staged adoption/long-running package는 `moonshot-phase-runner`로 라우팅

권장 다음 단계:
- 생성된 제품 패키지와 함께 `/moonshot-orchestrator`

## 참고

- `docs/public/guidelines/product-definition-workflow.md`
- `docs/public/guidelines/demo-first-mvp-gate.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/`
- `skills/product-gate-reviewer/SKILL.md`
- `skills/plan-ceo-review/SKILL.md`
- `skills/plan-eng-review/SKILL.md`
- `skills/task-slicer/SKILL.md`
- `skills/assumption-ledger/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`

## Project Knowledge Context Contract

product-definition 작업은 plan-package prompt assembly 전에 `stage=intake` 또는 `stage=plan`의 advisory `projectKnowledgeContext`를 사용합니다. 이 context는 compact recall source이며 enforcement source가 아닙니다.

helper가 unavailable이면 사용자가 strict memory task를 명시한 경우가 아닌 한 degraded advisory metadata로 계속 진행합니다. raw MemoryGraph/KG/ontology record, log, transcript, secret은 product prompt나 plan artifact에 inline하지 않습니다.
