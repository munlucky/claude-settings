---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동 구성한다.
---

# PM 오케스트레이터

## 역할
PM 분석 스킬을 순차 실행하고, `executionPlane`과 `workflowProfile`을 해석한 뒤 최종 체인을 만든다.

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
  workflowProfile: standard
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  allowIndeterminate: true
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
artifacts:
  verificationContractPath: ".claude/verification.contract.yaml"
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
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
5. `moonshot-decide-sequence`로 bundle/skill 체인 결정
6. 동적 게이트/검증 스텝 주입 후 순차 실행

## 허용 단계
- `pre-flight-check`
- `project-contract-gate`
- `context-readiness-gate`
- `verification-contract-gate`
- `requirements-analyzer`
- `context-builder`
- `codex-validate-plan`
- `karpathy-execution-gate`
- `implementation-runner`
- `completion-verifier`
- `verification-evidence-gate`
- `codex-review-code`
- `verify-changes.sh`
- `verify-runtime.sh`
- `failure-analyzer`
- `workflow-self-improver`

## 동적 삽입 규칙
- `projectContractReady=false` + `product_project` -> `project-contract-gate`
- `contextReady=false` + `product_project` -> `context-readiness-gate`
- `verificationContractReady=false` + `product_project` -> `verification-contract-gate`
- strict인데 evidence gate가 없으면 `verification-evidence-gate` 삽입
- 다중 실패가 쌓이면 `failure-analyzer` + `workflow-self-improver` 추가

## plane별 규칙
- `read_only`: 구현/검증 체인을 실행하지 않는다.
- `product_project`: readiness gate와 downstream bootstrap을 사용한다.
- `meta_harness`: downstream bootstrap gate를 건너뛰고, 핵심 워크플로우 변경이면 strict를 선호한다.

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
