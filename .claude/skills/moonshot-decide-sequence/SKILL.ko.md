---
name: moonshot-decide-sequence
description: `analysisContext`를 바탕으로 phase와 bundle/skill 체인을 결정한다.
---

# PM 시퀀스 결정

## 공유 스키마 (analysisContext.v1.1)

```yaml
signals:
  executionPlane: read_only|product_project|meta_harness
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  productDefinitionRequest: false
  hasProductIntent: false
  hasPrd: false
  hasSolution: false
  hasSpec: false
  hasExecutionPlan: false
  productPackageReady: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
  workflowProfile: standard
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  sprintContractReady: false
  qaReportReady: false
  handoffRequired: false
  designApproved: false
  isolatedWorkspaceReady: false
  evidenceGateRequired: true
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: {tasksRoot}/{feature-name}/context.md
  productDir: {tasksRoot}/{feature-name}/product
  productIntentPath: {productDir}/PRODUCT_INTENT.md
  prdPath: {productDir}/PRD.md
  solutionPath: {productDir}/SOLUTION.md
  specPath: {productDir}/SPEC.md
  planPath: {productDir}/PLAN.md
  assumptionsPath: {productDir}/ASSUMPTIONS.md
  blockersPath: {productDir}/BLOCKERS.md
  taskSliceGlob: {productDir}/tasks/*.md
  executionRoot: {tasksRoot}/{feature-name}/execution
  activeSliceDir: {executionRoot}/{active-slice}
  sprintContractPath: {activeSliceDir}/SPRINT_CONTRACT.md
  qaReportPath: {activeSliceDir}/QA_REPORT.md
  handoffPath: {activeSliceDir}/HANDOFF.md
  verificationContractPath: ".claude/verification.contract.yaml"
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
notes: []
```

## phase 규칙

1. `productDefinitionRequest == true && productPackageReady == false` -> `planning`
2. `hasPendingQuestions == true` -> `planning`
3. `implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation))` -> `integration`
4. `implementationComplete == true` -> `verification`
5. `productPackageReady == true && hasExecutionPlan == true` -> `implementation`
6. `requirementsClear && implementationReady` -> `implementation`
7. 그 외 -> `planning`

## bundle 선택

bundle을 먼저 결정한 뒤 `skillChain`으로 펼친다.

### `read_only`

- 기본적으로 구현 bundle 없음
- review-only 요청이면 `review-bundle`

### `product_project`

- `productDefinitionRequest == true` 이고 `productPackageReady == false` 이면:
  - 구현 bundle을 만들지 않는다
  - `product-orchestrator`로 직접 라우팅한다
- `productPackageReady == true` 이면:
  - simple:
    - `implementation-lite-bundle`
    - `verification-lite-bundle`
  - medium:
    - `readiness-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `logging-bundle`
  - complex:
    - `readiness-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `logging-bundle`
- product package가 없고 구현 요청이면:
  - simple:
    - `implementation-lite-bundle`
    - `verification-lite-bundle`
  - medium:
    - `readiness-bundle`
    - `planning-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `logging-bundle`
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
implementation-lite-bundle:
  - implementation-runner

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

verification-lite-bundle:
  - verify-changes.sh

verification-bundle:
  - completion-verifier
  - doc-auto-sync

review-bundle:
  - codex-review-code

logging-bundle:
  - efficiency-tracker
  - session-logger

meta-harness-bundle:
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - completion-verifier
```

medium/complex `product_project` 실행에서는 아래 execution bridge를 기본으로 요구한다.
- `implementation-runner`가 코드 변경 전 `artifacts.sprintContractPath`를 작성/갱신
- verifier가 `artifacts.qaReportPath`를 갱신
- 재시도, 일시중지, 컨텍스트 경계 종료 시 `artifacts.handoffPath`를 갱신

## 오버레이 규칙

- `workflowProfile == standard`
  - base bundle chain을 사용한다
- `workflowProfile == strict`
  - `allowIndeterminate=false`
  - downstream `feature|modification`면 `design-approval-gate` 삽입
  - 첫 `implementation-runner` 직전에 `workspace-isolation-gate` 삽입
  - `completion-verifier` 뒤 또는 simple 흐름의 `verify-changes.sh` 뒤에 `verification-evidence-gate` 삽입

## plane별 추가 규칙

- `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`는 `product_project`에만 적용한다.
- `meta_harness`는 downstream bootstrap gate를 건너뛴다.
- `read_only`는 구현/검증 bundle을 실행하지 않는다.

## 추가 규칙

- `signals.reactProject == true`이면 첫 `implementation-runner` 직전에 `frontend-design`을 삽입한다.
- `signals.reactProject == true`이면 `browser-verifier`를 `verify-changes.sh` 이전 또는 `completion-verifier` 이후에 삽입한다.
- master-plan/phase 문서가 있으면 `moonshot-phase-runner`를 `implementation-runner` 전에 삽입한다.
- 리팩토링 작업은 실패한 검증 뒤에 `build-error-resolver`를 삽입하고 단계별 빌드 체크를 유지한다.
- medium/complex 작업은 첫 `implementation-runner` 직전에 `karpathy-execution-gate`를 반드시 거친다.
- medium/complex `product_project`는 `HANDOFF.md` 출력을 위해 `logging-bundle`을 유지한다.
- 게이트에서 blocker가 나오면 planning 단계로 되돌린다.

## 병렬 실행 가이드

- 분류 직후: `moonshot-evaluate-complexity` + `moonshot-detect-uncertainty`
- 구현 후: `codex-review-code` + `verify-changes.sh`
- 로깅: `efficiency-tracker` + `session-logger`

병렬 금지:
- `codex-validate-plan` 과 `implementation-runner`
- strict gate와 그 gate가 보호하는 단계
- `verification-evidence-gate`와 완료 선언

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
