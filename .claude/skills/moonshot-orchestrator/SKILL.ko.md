---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동 구성한다.
---

# PM 오케스트레이터

## 역할

PM 분석 스킬을 순차 실행하고, `executionPlane`과 `workflowProfile`을 해석한 뒤 최종 체인을 만든다.

이 오케스트레이터는 **build control plane**이다.

직접 사용해도 되는 경우:
- 요청이 이미 구현 중심인 경우
- `{tasksRoot}/{feature-name}/product/` 아래에 product package가 이미 있는 경우

raw idea 정리의 주 진입점으로 쓰지 않는다.
요청이 아직 제품 정의 단계이고 product package가 없으면 upstream의 `product-orchestrator`로 리다이렉트한다.

## 사용법

```bash
/moonshot-orchestrator <사용자-요청>
/moonshot-orchestrator <사용자-요청> --use-teams
/moonshot-orchestrator <사용자-요청> --use-teams=review-team
```

> 사용 가능 팀: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. 상세 내용은 `moonshot-teams-runner/SKILL.md` 참조.

## 진입 정책

- 일반적인 코드 작업은 이 스킬을 기본 진입점으로 사용한다.
- 다음 경우는 우회 가능하다:
  - 사용자가 특정 스킬을 직접 지정한 경우
  - read-only / answer-only 작업
  - 오케스트레이터나 메타 워크플로우 자체를 수정하는 self-host 작업
- direct-skill 경로라도 파일 수정이 예상되면 가벼운 `pre-flight-check`를 먼저 태우는 편이 좋다.

## 입력

- `userMessage`, `gitBranch`, `gitStatus`, `recentCommits`, `openFiles`

## analysisContext 초기값

```yaml
schemaVersion: "1.1"
signals:
  executionPlane: unknown
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
  allowIndeterminate: true
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
artifacts:
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"
  contextDocPath: "{tasksRoot}/{feature-name}/context.md"
  productDir: "{tasksRoot}/{feature-name}/product"
  productIntentPath: "{productDir}/PRODUCT_INTENT.md"
  prdPath: "{productDir}/PRD.md"
  solutionPath: "{productDir}/SOLUTION.md"
  specPath: "{productDir}/SPEC.md"
  planPath: "{productDir}/PLAN.md"
  assumptionsPath: "{productDir}/ASSUMPTIONS.md"
  blockersPath: "{productDir}/BLOCKERS.md"
  taskSliceGlob: "{productDir}/tasks/*.md"
  verificationContractPath: ".claude/verification.contract.yaml"
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
notes: []
```

## 핵심 흐름

1. `executionPlane` 해석
   - `read_only`
   - `product_project`
   - `meta_harness`
2. `workflowProfile` 해석
   - 기본값은 `standard`
   - strict/no-warning 요청, 핵심 워크플로우 수정, 프로젝트 정책에 따라 `strict` 승격
3. `pre-flight-check`로 readiness 시그널 수집
4. `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty` 실행
5. upstream product package 존재 여부 감지
6. `moonshot-decide-sequence`로 bundle/skill 체인 결정
7. 동적 게이트/검증 스텝 주입 후 순차 실행

## 허용 단계

- `pre-flight-check`
- `teach-impeccable`
- `frontend-design`
- `audit`
- `normalize`
- `polish`
- `product-orchestrator`
- `project-contract-gate`
- `context-readiness-gate`
- `verification-contract-gate`
- `requirements-analyzer`
- `context-builder`
- `codex-validate-plan`
- `project-memory-agent`
- `project-memory-check`
- `design-approval-gate`
- `workspace-isolation-gate`
- `karpathy-execution-gate`
- `implementation-runner`
- `completion-verifier`
- `verification-evidence-gate`
- `doc-auto-sync`
- `codex-review-code`
- `verify-changes.sh`
- `verify-runtime.sh`
- `failure-analyzer`
- `workflow-self-improver`

## 동적 삽입 규칙

- `projectContractReady=false` + `product_project` -> `project-contract-gate`
- `contextReady=false` + `product_project` -> `context-readiness-gate`
- `verificationContractReady=false` + `product_project` -> `verification-contract-gate`
- `reactProject=true` -> 첫 `implementation-runner` 앞에 `frontend-design` 삽입
- strict인데 evidence gate가 없으면 `verification-evidence-gate` 삽입
- 다중 실패가 쌓이면 `failure-analyzer` + `workflow-self-improver` 추가

## plane별 규칙

- `read_only`: 구현/검증 체인을 실행하지 않는다.
- `product_project`: readiness gate와 downstream bootstrap을 사용한다.
- `meta_harness`: downstream bootstrap gate를 건너뛰고, 핵심 워크플로우 변경이면 strict를 선호한다.

## 프로젝트 메모리 로드

```yaml
Task 도구: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
Returns: { projectId, loaded, boundaries, relevantRules }
```

- Codex 런타임은 동일 입출력 계약의 격리 서브태스크로 동등 실행한다.
- 메모리 없음: `boundaryStatus: "not_initialized"`로 두고 계속 진행한다.
- MCP 불가: `boundaryStatus: "not_checked"` 경고 후 계속 진행한다.

## Product package 감지

일반 build planning 전에 upstream 제품 정의 산출물이 이미 있는지 감지한다.

감지 대상:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`

병합할 시그널:
- `hasProductIntent`
- `hasPrd`
- `hasSolution`
- `hasSpec`
- `hasExecutionPlan`
- `productPackageReady`
- `implementationReady`

라우팅 규칙:
- `productDefinitionRequest == true` 이고 `productPackageReady == false` 이면 `product-orchestrator`로 핸드오프
- `productPackageReady == true` 이면 upstream planning 단계를 건너뛰고 handoff package를 구현 기준선으로 사용

## 완료 검증 규칙

- `completion-verifier`가 있으면 우선 사용한다.
- simple 흐름은 `verify-changes.sh`를 fallback completion gate로 사용한다.
- `verificationState == indeterminate`
  - strict -> 실패
  - standard -> `pass_with_warning`
- strict에서는 완료 선언 직전에 `verification-evidence-gate`를 반드시 통과해야 한다.

## 계약

- 이 스킬은 오케스트레이션만 담당하며 구현 자체를 대체하지 않는다.
- 컨텍스트 오염 방지를 위해 fork 에이전트는 최소 입력 + 요약 반환만 허용한다.
- upstream 제품 정의가 아직 없으면 build 체인 안에서 제품 산출물을 임의 생성하지 말고 `product-orchestrator`로 라우팅한다.
- `PLAN.md`와 `tasks/*.md`가 있으면 이를 planning source of truth로 보고 `requirements-analyzer`, `context-builder`를 생략한다.
- `document-memory-policy.md`를 준수한다.
