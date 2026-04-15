---
name: moonshot-decide-sequence
description: `analysisContext`를 바탕으로 phase와 bundle/skill 체인을 결정한다.
---

# PM 시퀀스 결정

## 공개 범위

이 스킬은 내부 분석/라우팅 마이크로스킬입니다.
공개 진입은 `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`에 둡니다.

## 공유 계약

전체 계약을 이 문서에 다시 인라인하지 말고, 아래 canonical 파일을 사용합니다.
- `.claude/schemas/analysis-context.schema.yaml`
- `.claude/config/workflow-bundles.yaml`

이 마이크로스킬은 다음을 canonical 파일에서 읽어야 합니다.
- `analysisContext` 필드 구조와 기본값
- bundle 선택 매트릭스
- bundle 확장 규칙
- strict overlay 와 stage-order 규칙

## phase 규칙

1. `productDefinitionRequest == true && productPackageReady == false` -> `planning`
2. `hasPendingQuestions == true` -> `planning`
3. `implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation))` -> `integration`
4. `implementationComplete == true` -> `verification`
5. `planningReady == true && productPackageReady == true` -> `implementation`
6. `executionReady == true` -> `implementation`
7. `requirementsClear && hasContextMd && implementationReady` -> `implementation` (마이그레이션 fallback)
8. 그 외 -> `planning`

마이그레이션 규칙:
- rollout 중에는 explicit `readiness.*` 필드가 없을 때만 legacy signal 조합으로 `planningReady`와 `executionReady`를 추론합니다.

## bundle 선택

bundle을 먼저 결정한 뒤 `skillChain`으로 펼친다.
정규 라우팅 매트릭스는 `.claude/config/workflow-bundles.yaml`에 둔다.

분석 마이크로스킬은 orchestrator 내부 구성요소이며, 독립 workflow entrypoint로 제시하지 않는다.

- `signals.productDefinitionRequest == true` 이고 `signals.productPackageReady == false` 이면:
  - `product-orchestrator`로 라우팅
  - build planning이나 implementation으로 계속 진행하지 않음
- `signals.productPackageReady == true` 이면:
  - `PLAN.md`와 `tasks/*.md`를 planning baseline으로 간주
  - `requirements-analyzer`, `context-builder`는 건너뜀
  - handoff package를 검증한 뒤 구현 단계로 진행
  - medium/complex work에서는 active slice용 execution bridge artifact를 요구
  - 둘 다 있을 때는 `hasExecutionPlan`보다 `readiness.planningReady`를 우선 사용
  - active slice 진입 여부는 `implementationReady`보다 `readiness.executionReady`를 우선 사용

요약:
- `read_only`: 구현 bundle 금지, review-only 요청이면 `review-bundle`
- `product_project`: product package 유무에 따라 registry의 `withProductPackage` / `withoutProductPackage` 분기를 사용
- `meta_harness`: simple 와 medium/complex 분기를 registry에서 사용

## bundle 확장

bundle 확장 정의는 `.claude/config/workflow-bundles.yaml`를 기준으로 둔다.
이 문서는 decision logic만 설명하고 bundle 내용을 중복 유지하지 않는다.

medium/complex `product_project` 실행에서는 아래 execution bridge를 기본으로 요구한다.
- `implementation-runner`가 코드 변경 전 `artifacts.sprintContractPath`를 작성/갱신
- verifier가 `artifacts.qaReportPath`를 갱신
- 재시도, 일시중지, 컨텍스트 경계 종료 시 `artifacts.handoffPath`를 갱신

## 오버레이 규칙

overlay 와 stage-order 규칙은 `.claude/config/workflow-bundles.yaml`에서 해석한다.
최소 불변식:
- `workflowProfile == standard`는 base bundle chain 유지
- `workflowProfile == strict`는 strict gate를 삽입
- 의미 있는 코드 변경은 `review -> verify -> finish` 순서를 유지

## plane별 추가 규칙

plane별 추가 규칙도 `.claude/config/workflow-bundles.yaml`를 기준으로 사용한다.

## 추가 규칙

추가 규칙은 `.claude/config/workflow-bundles.yaml`에서 해석한다. 여기에는 다음이 포함된다.
- React 작업의 `frontend-design` 삽입
- 비사소한 코드 변경의 `code-simplifier` 삽입
- phase 문서 감지 시 `moonshot-phase-runner` 삽입
- refactor 검증 실패 시 `build-error-resolver` 삽입
- medium/complex 작업의 review/verification/finish 필수성

## 병렬 실행 가이드

허용/금지 병렬 그룹은 `.claude/config/workflow-bundles.yaml`를 기준으로 둔다.

## 출력 예시

product upstream redirect 예시:

```yaml
phase: planning
decisions:
  bundleChain: []
  skillChain:
    - product-orchestrator
  recommendedAgents:
    - product-orchestrator
  parallelGroups:
    - - moonshot-evaluate-complexity
      - moonshot-detect-uncertainty
notes:
  - "phase=planning, plane=product_project, chain=product-upstream"
```

implementation-ready 예시:

```yaml
phase: planning
decisions:
  bundleChain:
    - ready-isolate-bundle
    - planning-bundle
  skillChain:
    - pre-flight-check
    - project-contract-gate
    - context-readiness-gate
    - verification-contract-gate
    - requirements-analyzer
    - context-builder
    - codex-validate-plan
notes:
  - "phase=planning, plane=product_project, chain=medium"
```
