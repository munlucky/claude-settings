---
name: moonshot-decide-sequence
description: `analysisContext`를 바탕으로 phase와 bundle/skill 체인을 결정한다.
---

# PM 시퀀스 결정

## 공유 스키마 (analysisContext.v1.1)

```yaml
signals:
  executionPlane: read_only|product_project|meta_harness
  workflowProfile: standard
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
```

## phase 규칙
1. `hasPendingQuestions == true` -> `planning`
2. `implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation))` -> `integration`
3. `implementationComplete == true` -> `verification`
4. `requirementsClear && implementationReady` -> `implementation`
5. 그 외 -> `planning`

## bundle 선택

### `read_only`
- 기본적으로 구현 bundle 없음
- review-only 요청이면 `review-bundle`

### `product_project`
- simple:
  - `implementation-lite-bundle`
  - `verification-lite-bundle`
- medium:
  - `readiness-bundle`
  - `planning-bundle`
  - `implementation-bundle`
  - `verification-bundle`
  - `review-bundle`
- complex:
  - `readiness-bundle`
  - `planning-bundle`
  - `implementation-bundle`
  - `verification-bundle`
  - `review-bundle`
  - `logging-bundle`

### `meta_harness`
- simple:
  - `implementation-lite-bundle`
  - `verification-bundle`
- medium/complex:
  - `meta-harness-bundle`
  - `review-bundle`
  - `logging-bundle`

## bundle 확장

```yaml
readiness-bundle:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate

planning-bundle:
  - requirements-analyzer
  - context-builder
  - codex-validate-plan

implementation-bundle:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier

verification-bundle:
  - completion-verifier
  - doc-auto-sync

review-bundle:
  - codex-review-code

logging-bundle:
  - efficiency-tracker
  - session-logger
```

## 오버레이 규칙
- `workflowProfile == strict`
  - `allowIndeterminate=false`
  - downstream `feature|modification`면 `design-approval-gate` 삽입
  - 첫 구현 전에 `workspace-isolation-gate` 삽입
  - 완료 직전에 `verification-evidence-gate` 삽입

## plane별 추가 규칙
- readiness gate 3종은 `product_project`에만 적용한다.
- `meta_harness`는 downstream bootstrap gate를 건너뛴다.
- `read_only`는 구현/검증 bundle을 실행하지 않는다.

## 출력 예시

```yaml
phase: planning
decisions:
  bundleChain:
    - readiness-bundle
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
