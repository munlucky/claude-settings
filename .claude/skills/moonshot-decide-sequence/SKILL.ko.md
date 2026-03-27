---
name: moonshot-decide-sequence
description: `analysisContext`를 바탕으로 phase와 bundle/skill 체인을 결정한다.
---

# PM 시퀀스 결정

## 공개 범위

이 스킬은 내부 분석/라우팅 마이크로스킬입니다.
공개 진입은 `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`에 둡니다.

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
  phaseAttemptMode: false
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
  activePhaseDocPath: null
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

분석 마이크로스킬은 orchestrator 내부 구성요소이며, 독립 workflow entrypoint로 제시하지 않는다.

### `read_only`

- 기본적으로 구현 bundle 없음
- review-only 요청이면 `review-bundle`

### `product_project`

- `productDefinitionRequest == true` 이고 `productPackageReady == false` 이면:
  - 구현 bundle을 만들지 않는다
  - `product-orchestrator`로 직접 라우팅한다
- `productPackageReady == true` 이면:
  - simple:
    - `ready-isolate-bundle`
    - `implementation-lite-bundle`
    - `review-bundle`
    - `verification-lite-bundle`
    - `finish-bundle`
  - medium:
    - `ready-isolate-bundle`
    - `implementation-bundle`
    - `review-bundle`
    - `verification-bundle`
    - `finish-bundle`
  - complex:
    - `ready-isolate-bundle`
    - `implementation-bundle`
    - `review-bundle`
    - `verification-bundle`
    - `finish-bundle`
- product package가 없고 구현 요청이면:
  - simple:
    - `ready-isolate-bundle`
    - `planning-bundle`
    - `implementation-lite-bundle`
    - `review-bundle`
    - `verification-lite-bundle`
    - `finish-bundle`
  - medium:
    - `ready-isolate-bundle`
    - `planning-bundle`
    - `implementation-bundle`
    - `review-bundle`
    - `verification-bundle`
    - `finish-bundle`
  - complex:
    - `ready-isolate-bundle`
    - `planning-bundle`
    - `implementation-bundle`
    - `review-bundle`
    - `verification-bundle`
    - `finish-bundle`

### `meta_harness`

- simple:
  - `implementation-lite-bundle`
  - `review-bundle`
  - `verification-lite-bundle`
  - `finish-bundle`
- medium/complex:
  - `meta-harness-bundle`
  - `review-bundle`
  - `verification-bundle`
  - `finish-bundle`

## bundle 확장

```yaml
implementation-lite-bundle:
  - implementation-runner

ready-isolate-bundle:
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
  - browser-verifier (if runtime or web verification is needed)
  - completion-verifier

review-bundle:
  - codex-review-code
  - security-reviewer (if security-sensitive changes exist)
  - audit (if explicit UI quality audit is requested)
  - web-design-guidelines (if explicit UI/UX review is requested)

finish-bundle:
  - doc-auto-sync
  - session-logger

logging-bundle:
  - session-logger

meta-harness-bundle:
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
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

단계 순서 규칙:
- 의미 있는 코드 변경이 있으면 `review-bundle -> verification-bundle|verification-lite-bundle -> finish-bundle` 순서를 유지한다
- active review/verification 판정 전에 `finish-bundle`을 앞당기지 않는다

## plane별 추가 규칙

- `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`는 `product_project`에만 적용한다.
- `meta_harness`는 downstream bootstrap gate를 건너뛴다.
- `read_only`는 구현/검증 bundle을 실행하지 않는다.

## 추가 규칙

- `signals.reactProject == true`이면 첫 `implementation-runner` 직전에 `frontend-design`을 삽입한다.
- 의미 있는 코드 변경이 있으면 `implementation-runner` 뒤, 최종 검증 전에 `code-simplifier`를 삽입한다.
- `signals.reactProject == true`이면 `browser-verifier`를 검증 경로에 계층화해 `verify-changes.sh` 이전 또는 `completion-verifier` 이후에 삽입한다.
- `qa-flow`는 기본 검증 체인 구성요소가 아니라 수동 또는 명시적 후속 verifier다.
- master-plan/phase 문서가 있으면 `moonshot-phase-runner`를 `implementation-runner` 전에 삽입한다. 단, `signals.phaseAttemptMode == true`이면 예외다.
- `signals.phaseAttemptMode == true`이면 이번 round는 `artifacts.activePhaseDocPath`와 기존 execution artifact만 planning baseline으로 사용한다.
- 리팩토링 작업은 실패한 검증 뒤에 `build-error-resolver`를 삽입하고 단계별 빌드 체크를 유지한다.
- medium/complex 작업은 첫 `implementation-runner` 직전에 `karpathy-execution-gate`를 반드시 거친다.
- medium/complex `product_project`는 `review-bundle`, `verification-bundle`, `finish-bundle`을 모두 유지한다.
- 의미 있는 파일 수정이 있는 모든 `product_project` 작업은 완료 전에 `doc-auto-sync`, `session-logger`가 실행되도록 체인 마지막에 `finish-bundle`을 유지한다.
- simple bounded change에서 review를 의도적으로 생략하면 notes에 이유를 남긴다.
- 게이트에서 blocker가 나오면 planning 단계로 되돌린다.

## 병렬 실행 가이드

- 분류 직후: `moonshot-evaluate-complexity` + `moonshot-detect-uncertainty`
- 구현 후: 입력이 독립적일 때 `codex-review-code` + `browser-verifier`
- finish-stage 로깅: 어느 쪽도 단독으로 완료 상태를 확정하지 않을 때 `doc-auto-sync` + `session-logger`

병렬 금지:
- `codex-validate-plan` 과 `implementation-runner`
- strict gate와 그 gate가 보호하는 단계
- `verification-evidence-gate`와 완료 선언
- `completion-verifier`와 코드 수정 remediation

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
