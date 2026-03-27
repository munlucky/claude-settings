---
name: moonshot-orchestrator
description: 이미 충분한 문맥이 있고 phase harness가 필요 없는 bounded implementation 작업에 사용합니다.
---

# PM 오케스트레이터

## 역할

PM 분석 스킬을 순차 실행하고, `executionPlane`과 `workflowProfile`을 해석한 뒤 최종 체인을 만든다.

이 오케스트레이터는 **build control plane**이다.

직접 사용해도 되는 경우:
- 요청이 이미 구현 중심인 경우
- `{tasksRoot}/{feature-name}/product/` 아래에 product package가 이미 있는 경우
- 작업 범위가 phase harness 없이 처리 가능한 bounded implementation인 경우

raw idea 정리의 주 진입점으로 쓰지 않는다.
요청이 아직 제품 정의 단계이고 product package가 없으면 upstream의 `product-orchestrator`로 리다이렉트한다.
작업이 크거나, 장시간 지속되거나, phase 문서 중심이면 upstream의 `moonshot-phase-runner`로 리다이렉트한다.

## 사용법

```bash
/moonshot-orchestrator <사용자-요청>
/moonshot-orchestrator <사용자-요청> --use-teams
/moonshot-orchestrator <사용자-요청> --use-teams=review-team
```

> 사용 가능 팀: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. 상세 내용은 `moonshot-teams-runner/SKILL.md` 참조.

## 진입 정책

- bounded code work는 이 스킬을 기본 진입점으로 사용한다.
- large phase 기반 작업의 기본 진입점으로는 이 스킬을 사용하지 않고 `moonshot-phase-runner`를 우선한다.
- 다음 경우는 우회 가능하다:
  - 사용자가 특정 스킬을 직접 지정한 경우
  - read-only / answer-only 작업
  - 오케스트레이터나 메타 워크플로우 자체를 수정하는 self-host 작업
- direct-skill 경로라도 파일 수정이 예상되면 가벼운 `pre-flight-check`를 먼저 태우는 편이 좋다.
- Claude Code 와 Codex 모두에서 phase/adapter 경로는 채팅 기억이 아니라 `SPRINT_CONTRACT.md` 의 policy anchors 를 통해 정책을 이어받아야 한다.

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
  sprintContractReady: false
  qaReportReady: false
  handoffRequired: false
  phaseLoopInSession: false
  phaseAttemptMode: false
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
artifacts:
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"
  workflowGuidePath: "workflow/README.md"
  designGuidePath: "docs/design/README.md"
  glossaryGuidePath: "docs/glossary/README.md"
  dailyGuidePath: "docs/daily/README.md"
  dailyLogDir: "docs/daily"
  testGuidePath: "TEST_GUIDE.md"
  analysisRoot: "docs/analysis"
  analysisIndexPath: "docs/analysis/README.md"
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
  executionRoot: "{tasksRoot}/{feature-name}/execution"
  activeSliceDir: "{executionRoot}/{active-slice}"
  activePhaseDocPath: null
  sprintContractPath: "{activeSliceDir}/SPRINT_CONTRACT.md"
  qaReportPath: "{activeSliceDir}/QA_REPORT.md"
  handoffPath: "{activeSliceDir}/HANDOFF.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  verificationContractPath: ".claude/verification.contract.yaml"
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
  workflowEvidencePath: ".claude/logs/workflow-enforcement/latest-bounded.json"
workflowEvidence:
  mode: bounded-direct
  selectedBundles: []
  requiredSkills: []
  stageOrder: []
  appliedSkills: []
  skippedSkills: []
  evidenceFiles:
    analysisContext: ".claude/docs/moonshot-analysis.yaml"
    qaReport: null
    handoff: null
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

### Stage-chain 정규화

선택된 체인은 저장소의 stage 모델에 맞춰 다시 정규화한다.

- `read_only`:
  - 구현 단계 이전에서 멈춘다
- bounded `product_project`, simple:
  - `plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`
- bounded `product_project`, medium/complex:
  - `plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`
  - execution bridge artifact를 명시적으로 요구한다
- phase 기반 작업:
  - `moonshot-phase-runner`로 핸드오프한 뒤, 각 phase 내부에서도 같은 downstream stage 순서를 유지한다

의미 있는 코드 변경이 있었다면 `review -> verify -> finish`를 하나의 뭉툭한 마감 단계로 합치지 않는다.

medium/complex `product_project`는 아래 execution bridge를 기본 전제로 둔다.
- `SPRINT_CONTRACT.md`: 이번 slice 목표, non-goal, done check
- `QA_REPORT.md`: verifier 결과와 다음 수정 입력
- `HANDOFF.md`: 재시도/중단/장시간 세션 인계 상태
- strict 또는 `meta_harness` phase 작업은 active `SPRINT_CONTRACT.md` 에 policy anchors 와 필수 검증 명령을 유지해야 한다.
- phase harness를 쓰지 않는 bounded direct 작업도 `.claude/docs/moonshot-analysis.yaml`의 `workflowEvidence`를 최신 상태로 유지해야 한다.
- bounded direct `workflowEvidence`에는 `selectedBundles`, `requiredSkills`, `stageOrder`가 모두 있어야 한다.
- bounded direct 코드 변경은 최종 verification 안정 판정 전에 `codex-review-code` 증적을 남겨야 한다.
- bounded direct 코드 변경은 `code-simplifier` 적용 여부를, 건너뛴 경우에는 이유와 함께 기록해야 한다.
- 구현이 성공했거나 일부 성공 상태라도 완료 선언 전에는 문서 마감 단계가 실행되어야 한다.
- bounded direct 경로에서 의미 있는 파일 수정이 있으면 완료 전 `doc-auto-sync` 증적을 반드시 남긴다.
- bounded direct 실행이 중단되면 clean completion 전에 `session-logger` 증적을 남겨야 한다.

review cadence 계약:
- simple bounded change: 구현 후 한 번의 post-implementation review로 충분한 경우가 많다
- medium change: 첫 의미 있는 구현 배치 뒤에 리뷰하고, 코드 수정 remediation 뒤에 다시 리뷰한다
- complex/long-running change: plan 리뷰, 의미 있는 구현 배치 리뷰, 동작/계약 변경 remediation 리뷰를 모두 수행한다
- review를 생략했다면 notes 또는 workflow evidence에 이유를 남긴다

finish / handoff 계약:
- `finish-bundle`은 active review/verify 판정이 안정된 뒤에만 들어간다
- clean finish:
  - 최신 증거와 함께 verification 통과
  - `doc-auto-sync` 실행
  - 재개 가능 상태나 의사결정 이력이 중요하면 `session-logger` 실행
- resume-later handoff:
  - `QA_REPORT.md` 갱신
  - `HANDOFF.md` 갱신
  - 완료 선언 금지
- explicit commit path:
  - 사용자가 메모리 현행화와 커밋을 함께 원할 때만 `commit-moonshot` 실행

프로젝트 기준 문서가 있으면 `product_project` 작업의 1급 참조로 취급한다.
- `workflow/README.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `TEST_GUIDE.md`
- `docs/analysis/README.md` 및 관련 `docs/analysis/*.md`

정책:
- 이 문서들 중 일부가 없어도 그 사실만으로 바로 차단하지 않는다.
- 기준 문서 세트가 비어 있거나 오래됐으면 `pre-flight-check`에서 표면화하고 가능하면 `project-md-refresh`를 우선한다.
- 구현, 검증, 명명, 로깅 단계는 이 문서가 있을 때 임의 추측보다 문서 기준을 우선한다.

`moonshot-phase-runner`가 `in-session-coordinator` 모드를 반환하면:
- 메인 세션은 coordinator로만 남는다.
- 각 구현/검증 round는 fresh fork/sub-agent attempt로 실행한다.
- 메인 세션에는 요약 결과만 병합한다.
- 실제 루프 실행은 `moonshot-in-session-coordinator`가 맡는다.

`moonshot-phase-runner`가 `autoStartExecution=true`를 반환하면:
- `executionSkill`을 즉시 실행한다.
- `prepareOnly=true`가 아닌 한 사용자에게 다시 수동 실행을 요구하지 않는다.

## 검증 판정 규칙

- contract 기반 검증은 `contractApplicable == true` 또는 `verificationMode == contract` 로 해석합니다.
- `verificationState == passed` 라도 최신 증거가 없거나 required check가 비어 있지 않으면 완료로 올리지 않습니다.
- contract 기반 run이면 `verificationFailed`로 재분류해 `QA_REPORT.md`를 갱신하고 수정/재시도 경로로 되돌립니다.
- contract 밖의 workspace/fallback run이면 profile에 따라 경고 또는 보수적 remediation 상태로 유지합니다.

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
- `code-simplifier`
- `completion-verifier`
- `verification-evidence-gate`
- `doc-auto-sync`
- `codex-review-code`
- `verify-changes.sh`
- `verify-runtime.sh`
- `efficiency-tracker`
- `session-logger`
- `failure-analyzer`
- `workflow-self-improver`

## 동적 삽입 규칙

- `projectContractReady=false` + `product_project` -> `project-contract-gate`
- `contextReady=false` + `product_project` -> `context-readiness-gate`
- `verificationContractReady=false` + `product_project` -> `verification-contract-gate`
- `executionPlane == product_project && complexity != simple` -> `session-logger` 보장 + 첫 코드 변경 전 `SPRINT_CONTRACT.md` 요구
- 의미 있는 코드 변경 또는 medium+ complexity -> 최종 verification 전에 `codex-review-code` 보장
- `implementationComplete=true` + 의미 있는 파일 수정 -> 검증 뒤, 완료 전 `doc-auto-sync` 보장
- 의미 있는 파일 수정 + 안정된 verifier 상태 -> 최종 완료 선언 전 `session-logger` 보장
- `reactProject=true` -> 첫 `implementation-runner` 앞에 `frontend-design` 삽입
- `implementationComplete=true` + 의미 있는 코드 변경 -> `completion-verifier` 전에 `code-simplifier` 삽입
- `phaseRunnerResult.autoStartExecution == true` -> `executionSkill`을 즉시 실행하고 `phaseRunnerResult`를 입력으로 전달
- `phaseRunnerResult.executionMode == in-session-coordinator` -> `moonshot-in-session-coordinator` 삽입 + 메인 세션 coordinator 유지 + 각 round는 fresh fork/sub-agent attempt로 실행
- 검증 실패 -> `QA_REPORT.md` 갱신 후 구현 단계 재진입
- `docStale=true` -> 체인 시작에 `doc-auto-sync` 삽입, 구현 후 최종 doc-ops 단계는 그대로 유지
- 재시도/중단/컨텍스트 경고 -> `HANDOFF.md` 갱신
- strict인데 evidence gate가 없으면 `verification-evidence-gate` 삽입
- 다중 실패가 쌓이면 `failure-analyzer` + `workflow-self-improver` 추가

## plane별 규칙

- `read_only`: 구현/검증 체인을 실행하지 않는다.
- `product_project`: readiness gate와 downstream bootstrap을 사용한다.
- `meta_harness`: downstream bootstrap gate를 건너뛰고, 핵심 워크플로우 변경이면 strict를 선호한다.

## 상태 전이 표

| Verifier 상태 | 전이 |
|---|---|
| `passed` + 최신 증거 + required check 완료 | 완료 후보 |
| `passed` 이지만 최신 증거 없음 또는 required check 미완료 | remediation/retry로 재분류, 완료 금지 |
| `indeterminate` | strict=`failed`, standard=`pass_with_warning` |
| `failed` | 재시도 또는 실패 |

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
- verifier는 실행할 때마다 `QA_REPORT.md`를 갱신해야 한다.
- clean completion 전에 멈추면 `HANDOFF.md`를 남긴다.
- strict에서는 완료 선언 직전에 `verification-evidence-gate`를 반드시 통과해야 한다.
- `phaseLoopInSession=true`이면 재시도는 메인 세션 직접 구현이 아니라 새 fresh attempt로 다시 들어가야 한다.

## 계약

- 이 스킬은 오케스트레이션만 담당하며 구현 자체를 대체하지 않는다.
- 컨텍스트 오염 방지를 위해 fork 에이전트는 최소 입력 + 요약 반환만 허용한다.
- upstream 제품 정의가 아직 없으면 build 체인 안에서 제품 산출물을 임의 생성하지 말고 `product-orchestrator`로 라우팅한다.
- `PLAN.md`와 `tasks/*.md`가 있으면 이를 planning source of truth로 보고 `requirements-analyzer`, `context-builder`를 생략한다.
- medium/complex `product_project`는 active slice 기준으로 `SPRINT_CONTRACT -> QA_REPORT -> HANDOFF`를 유지한다.
- bounded direct 경로에서 코드가 수정되면 먼저 `QA_REPORT.md`의 workflow evidence를 최신 상태로 유지한 뒤 `bash .claude/scripts/workflow-enforcement.sh record-bounded --analysis-path .claude/docs/moonshot-analysis.yaml`로 동일한 경계를 기록한다.
- `record-bounded`는 analysis 파일의 `workflowEvidence`를 정규화하고 canonical bundle/required skill/stage order를 채우며, `QA_REPORT.md`가 제공되면 applied/skipped evidence도 거기서 동기화한다.
- in-session phase loop는 fresh isolated attempt를 전제로만 허용하며, coordinator 세션은 round 사이에 summary-only 상태를 유지한다.
- phase attempt 요약을 완료 선언으로 바꾸려면 해당 시도의 verifier evidence 가 최신이고 contract 기준 required check 가 모두 충족되어야 한다.
- fresh attempt가 `moonshot-orchestrator`를 실행할 때는 `phaseAttemptMode=true`로 두고 `moonshot-phase-runner`를 재귀적으로 다시 넣지 않는다.
- `document-memory-policy.md`를 준수한다.

## 상태 전이 표

| Verifier 상태 | 전이 |
|---|---|
| `passed` + 최신 증거 + required check 완료 | 완료 후보 |
| `passed` 이지만 최신 증거 없음 | 완료 불가 |
| `indeterminate` | strict=`failed`, standard=`pass_with_warning` |
| `failed` | 재시도 또는 실패 |
