---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동으로 실행한다.
---

# PM 오케스트레이터

## 역할
PM 분석 스킬들을 순차적으로 실행하고 최종 에이전트 체인을 구성하는 오케스트레이터.

이 오케스트레이터는 **build control plane**입니다.

직접 사용해도 되는 경우:
- 요청이 이미 구현 중심인 경우
- `{tasksRoot}/{feature-name}/product/` 아래에 product package가 이미 있는 경우

raw idea 정리의 주 진입점으로 쓰지 않습니다.
요청이 아직 제품 정의 단계이고 product package가 없으면 upstream의 `product-orchestrator`로 리다이렉트합니다.

## 사용법

```bash
/moonshot-orchestrator <사용자-요청>
/moonshot-orchestrator <사용자-요청> --use-teams
/moonshot-orchestrator <사용자-요청> --use-teams=review-team
```

> 사용 가능 팀: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. 상세 내용은 `moonshot-teams-runner/SKILL.md` 참조.

## 입력
자동 수집:
- `userMessage`, `gitBranch`, `gitStatus`, `recentCommits`, `openFiles`

## 런타임 어댑터 정책

오케스트레이션 시작 전에 `executionRuntime`을 먼저 결정합니다.

- `claude-code`: Claude 도구 라우팅(`Skill`, `Task`, `Plugin`, `Bash`, `AskUserQuestion`) 사용
- `codex`: 현재 Codex 세션에서 동일 체인을 네이티브 도구로 실행
  - 문서상 `Task (fork)` 단계는 최소 입력 전달 + 요약 결과 병합 규칙으로 동일한 격리 계약을 유지
  - 불확실성/질문 처리는 `codex-validate-plan`(계획 단계), `codex-review-code`(구현 후 단계) 결과를 우선 사용
  - 해당 결과에서도 차단 이슈가 남을 때만 사용자 질문 수행

## 컨텍스트 예산 규칙

> **중요**: 메인 세션 컨텍스트 오염 방지.

1. **파일 내용 인라인 금지**: analysisContext에 경로만 기록, 내용 복사 금지
2. **서브스킬 결과**: notes에 요약만 병합 (결과당 최대 5줄)
3. **Notes 상한**: notes 배열 10개 초과 시 오래된 항목 아카이빙
4. **리뷰 결과**: codex-review-code 출력에서 핵심 이슈만 추출
5. **Fork 반환값**: fork 에이전트에서 구조화된 요약만 수신, 원본 데이터 금지

## 워크플로우

### 1. analysisContext 초기화

```yaml
schemaVersion: "1.0"
request: { userMessage, taskType: unknown, keywords: [] }
repo: { gitBranch, gitStatus, openFiles: [], changedFiles: [] }
signals:
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
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
estimates: { estimatedFiles: 0, estimatedLines: 0, estimatedTime: unknown }
phase: unknown
complexity: unknown
missingInfo: []
decisions: { recommendedAgents: [], skillChain: [], parallelGroups: [] }
fixForward:
  enabled: true
  policy: { critical: block, high: fix-forward-task, medium: merge-with-note, low: auto-approve }
  tasks: []
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
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
tokenBudget: { specSummaryTrigger: 2000, splitTrigger: 5, contextMaxTokens: 8000, warningThreshold: 0.8 }
projectMemory: { projectId: null, boundaryStatus: "not_checked", boundary: { violations: [], needsApproval: [], reminders: [] }, relatedConventions: [], lastChecked: null }
notes: []
```

### 2. PM 스킬 순차 실행

#### 2.0 대형 명세서 처리
`.claude/docs/guidelines/document-memory-policy.md` 준수:
- `userMessage` > 2000단어 → `specification.md`로 요약, 원본 아카이빙
- 독립 기능 > 5개 → `subtasks/subtask-NN/`으로 분할 (독립 `context.md`)
- `context.md`를 `tokenBudget.contextMaxTokens` 이하로 유지

#### 2.0.5 프로젝트 메모리 로드 (Fork)

> 컨텍스트 오염 방지를 위해 `project-memory-agent`를 **fork 서브에이전트**로 실행.

```
Task 도구: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
Returns: { projectId, loaded, boundaries, relevantRules } → projectMemory에 병합
```
- Codex 런타임: 동일 입출력 계약의 격리 서브태스크로 동등 실행
- 메모리 없음: `boundaryStatus: "not_initialized"`, 계속 진행
- MCP 불가: `boundaryStatus: "not_checked"`, 경고 후 진행

#### 2.0.6 Product package 감지
일반 build planning 전에 upstream 제품 정의 산출물이 이미 있는지 감지합니다.

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

#### 2.1 작업 분류
`/moonshot-classify-task` 실행 → patch 병합 (taskType, keywords, signals)

#### 2.2 복잡도 평가
`/moonshot-evaluate-complexity` 실행 → patch 병합 (complexity, estimates)

#### 2.3 불확실성 검출
`/moonshot-detect-uncertainty` 실행 → patch 병합 (missingInfo)

#### 2.4 불확실성 처리
`missingInfo`가 비어있지 않으면:
1. 불확실성 질문 처리:
   - `claude-code`: `AskUserQuestion`으로 질문 생성 (priority HIGH 우선)
   - `codex`: `codex-validate-plan`을 먼저 실행해 블로킹 질문을 도출하고, 미해결 차단 항목이 남을 때만 사용자 질문
2. 답변을 analysisContext에 반영
3. `signals.hasPendingQuestions = false` 설정
4. 필요 시 재검출

#### 2.5 시퀀스 결정
`/moonshot-decide-sequence` 실행 → patch 병합 (phase, skillChain, parallelGroups)

#### 2.6 계획 크기 관리
`document-memory-policy.md` 준수: 80% 임계치에서 아카이빙, 100%에서 요약.

### 3. 에이전트 체인 실행

`decisions.skillChain`을 순서대로 실행.

**허용된 단계:**

| 단계 | 유형 | 비고 |
|------|------|------|
| `pre-flight-check` | Skill | |
| `product-orchestrator` | Skill | upstream redirect 전용 |
| `project-memory-agent` | Task (fork) | 컨텍스트 격리 |
| `project-memory-check` | Task (fork) | 구현 전 경계 체크(검사 전용) |
| `requirements-analyzer` | Task | |
| `context-builder` | Task | |
| `codex-validate-plan` | Skill | |
| `karpathy-execution-gate` | Skill | 구현 전 실행 규율 게이트 |
| `implementation-runner` | Task | |
| `code-simplifier` | Plugin | 구현 후 코드 간소화 |
| `completion-verifier` | Skill (fork) | 테스트 환경 자동 감지 |
| `doc-auto-sync` | Skill | 문서 자동 동기화 및 부트스트랩 |
| `codex-review-code` | Skill | |
| `project-memory-reviewer` | Task (fork) | 컨텍스트 격리 |
| `vercel-react-best-practices` | Skill | reactProject=true 시 |
| `security-reviewer` | Skill | |
| `build-error-resolver` | Skill | |
| `browser-verifier` | Skill | 웹 프로젝트 런타임 검증 |
| `verify-runtime.sh` | Bash | 런타임 URL/E2E 검증 |
| `verify-changes.sh` | Bash | |
| `efficiency-tracker` | Skill | |
| `session-logger` | Skill | |
| `moonshot-phase-runner` | Skill | |
| `moonshot-teams-runner` | Skill | |
| `team-leader-agent` | Task (fork) | 팀 조율 |
| `failure-analyzer` | Skill (fork) | 시스템 실패 분석 |
| `workflow-self-improver` | Skill (fork) | 메타 시스템 자동 개선 |
| `commit-moonshot` | Skill | |

**에이전트 매핑:**

| 에이전트 | subagent_type | 비고 |
|----------|---------------|------|
| `project-memory-agent` | general-purpose | fork, 2.1 전 |
| `project-memory-check` | general-purpose | fork, 구현 전 check-only 모드 (`.claude/agents/project-memory-check.md`) |
| `requirements-analyzer` | general-purpose | |
| `context-builder` | context-builder | |
| `implementation-runner` | implementation-agent | |
| `project-memory-reviewer` | general-purpose | fork, codex-review-code 후 |
| `team-leader-agent` | general-purpose | fork, --use-teams 시 |

**실행 규칙:**
1. 순차 실행 (`parallelGroups` 내에서만 병렬)
2. 런타임 라우팅:
   - `claude-code`: Skill → `Skill` 도구, Agent → `Task` 도구, Plugin → `Plugin` 도구, Script → `Bash` 도구
   - `codex`: 동일 단계 계약을 유지하며 세션 내 네이티브 도구/셸로 동등 실행
3. `Task (fork)` 의미를 갖는 단계는 런타임과 무관하게 컨텍스트 격리(최소 입력, 요약 반환만) 유지
4. 미정의 단계 → 사용자에게 확인 후 중단
5. 모든 단계는 `document-memory-policy.md` 준수
6. `product-orchestrator`가 선택되면 redirect/handoff 경계로 취급하고, 같은 패스 안에서 product package가 반환되지 않는 한 build 체인을 계속 진행하지 않음

**메모리 단계 분리 계약**:
- `project-memory-agent`: 2.0.5 단계에서 프로젝트 메모리 로드/업데이트
- `project-memory-check`: 구현 전 경계 준수 검사 전용 단계 (메모리 변경 없음, `.claude/agents/project-memory-check.md` 사용)
- `project-memory-reviewer`: 리뷰 이후 경계 준수 재검증

**Agent Teams 연동 (--use-teams):**
1. `signals.useAgentTeams = true` 설정
2. `team-leader-agent`를 팀 설정과 함께 fork (팀 상세는 `moonshot-teams-runner/SKILL.md` 참조)
3. 요약된 `teamReport`를 `analysisContext.notes`에 병합

> [!CAUTION]
> Agent Teams: ~13K 토큰 (2명) / ~20K 토큰 (3명). 중요한 리뷰나 복잡한 구현에만 사용.

**Fork 기반 에이전트** (`project-memory-agent`, `project-memory-check`, `project-memory-reviewer`, `team-leader-agent`):
- 별도 컨텍스트 세션에서 실행
- 요약된 결과만 반환 → 메인 세션 컨텍스트 오염 방지

### 3.1 동적 스킬 삽입

| 시그널 | 트리거 | 액션 |
|--------|--------|------|
| `buildFailed` | `verify-changes.sh` exit `1` | `build-error-resolver` 삽입 후 재시도 (최대 2회) |
| `testFailed` | `verify-changes.sh` exit `2` | 테스트 우선 보정으로 `implementation-runner` 재진입 후 검증 재실행 |
| `runtimeUnavailable` | `verify-runtime.sh` exit `1` | 서버/런타임 준비 상태 수정 요청 후 `browser-verifier` 재실행 (최대 1회) |
| `e2eFailed` | `verify-runtime.sh` exit `2` | `testFailed`와 동일 정책 적용 (테스트 우선 보정 + 런타임 재검증) |
| `securityConcern` | `.env`/`auth`/`token`/`secret` 파일 변경 | codex-review-code 후 `security-reviewer` 추가 |
| `coverageLow` | completion-verifier: 커버리지 < 80% | 경고 로깅, 추가 테스트 요청 |
| `reactProject` | `.tsx`/`.jsx` 파일 또는 React 키워드 | codex-review-code 후 `vercel-react-best-practices` 삽입 |
| `implementationComplete` | implementation-runner 완료 | completion-verifier 전 `code-simplifier` 삽입 |
| `docStale` | pre-flight-check에서 stale 문서 감지 | 체인 시작 부분에 `doc-auto-sync` 삽입 |
| `newProject` | ARCHITECTURE.md 없음 + 복잡한 태스크 | 체인 시작 부분에 `doc-auto-sync --init` 삽입 |
| `webRuntimeCheck` | `reactProject == true` | `verify-changes.sh` 앞에 `browser-verifier` 삽입 (`verify-changes.sh`가 없으면 `completion-verifier` 직후) |
| `phasePlanDetected` | master plan + phase 문서 감지 | `implementation-runner` 전에 `moonshot-phase-runner`를 삽입해 phase-status 준비/핸드오프 수행 |
| `executionDisciplineMissing` | medium/complex 체인에 `implementation-runner`는 있으나 `karpathy-execution-gate`가 없음 | 첫 `implementation-runner` 직전에 `karpathy-execution-gate` 삽입 |
| `multipleFailures` | notes에 에러/실패 2건 이상 | 체인 끝에 `failure-analyzer` + `workflow-self-improver` 추가 |

### 3.2 프로젝트 메모리 리뷰 (Fork)

`codex-review-code` 이후:
```
Task 도구: project-memory-reviewer (subagent_type: general-purpose)
Input: { projectId, changedFiles, projectMemoryContext, diff }
Returns: { status, violations, needsApproval, warnings, reminders }
```
- `status: "failed"` → **중단**, 위반 사항 보고
- `status: "needs_approval"` → 사용자 승인 요청
- `status: "passed"` → 다음 단계 진행

### 3.3 완료 검증 루프

`implementation-runner` 완료 후:
1. `decisions.skillChain`에 `completion-verifier`가 있으면 호출합니다.
2. `completion-verifier`가 없는 simple 흐름은 `verify-changes.sh`(웹 프로젝트는 `browser-verifier` 포함)를 완료 게이트로 사용합니다.
3. `completionStatus.verificationState == passed`(또는 동등한 게이트 통과)면 `implementationComplete: true` 설정 후 진행합니다.
4. `completionStatus.verificationState == indeterminate`(일반적으로 `allPassed: null`)이면:
   - 가능할 경우 fallback 게이트로 `verify-changes.sh`(웹은 `browser-verifier` 포함)를 실행합니다.
   - fallback 통과 + Self-Audit blocker 없음이면 경고 노트를 남기고 `implementationComplete: true`로 진행합니다.
   - fallback 불가 또는 실패 시 사용자 명시적 판단/개입을 요청합니다.
5. 실패(`verificationState == failed` 또는 fallback 실패) + retryCount < 2이면 실패 원인별 종료 코드 전략(`exit 1` 빌드 우선 수정, `exit 2` 테스트 우선 수정)으로 복구 후 재시도합니다.
6. 실패 + retryCount ≥ 2이면 사용자 개입을 요청합니다.

### 3.4 Phase Runner 핸드오프 계약

체인에 `moonshot-phase-runner`가 포함된 경우:
1. 이를 구현 완료가 아닌 **실행 준비 단계**로 취급합니다.
2. `.claude/docs/phase-status.yaml` 생성을 필수로 하고, 아래 요약 필드를 `notes`에 병합합니다.
   - `masterPlan`, `autonomousMode`, `preparedAt`, `pendingPhases`
3. phase-runner 출력의 외부 실행 명령을 핸드오프로 기록합니다.
   - `.claude/scripts/agent-loop.sh <plan-dir>`
4. `phase-status.yaml`에 실제 실행 업데이트가 반영된 뒤에만 메인 오케스트레이터 검증 루프를 재개합니다.

### 3.5 Fix Forward 사후 리뷰

`codex-review-code` 이후 fix-forward 정책 적용:
1. **REJECT (CRITICAL)** → 구현 재진입, 머지 금지
2. **FIX-FORWARD (HIGH)** → 머지 허용. `fixForward.tasks[]`에 태스크 추가.
   - session-logger에 각 태스크 기록
   - 커밋 메시지에 포함: `[fix-forward: N tasks]`
3. **MERGE-NOTE (MEDIUM)** → 경고와 함께 머지 허용
4. **APPROVE** → 정상 머지

Fix-forward 태스크는 `session-logger` HANDOFF.md를 통해 다음 세션으로 인계.

### 4. 결과 기록
최종 analysisContext를 `.claude/docs/moonshot-analysis.yaml`에 저장.

## 에러 처리

1. **스킬 실패**: notes에 기록, 사용자에게 보고
2. **미정의 단계**: 사용자에게 확인 후 중단
3. **질문 루프**: 최대 3회, 이후 기본값으로 진행
4. **토큰 한도**: 아카이빙 및 요약 후 계속

## 계약
- 오케스트레이션만 수행, 직접 분석 안 함
- Patch 병합: 얕은 오브젝트 머지
- 사용자 질문: Claude 런타임은 `AskUserQuestion`, Codex 런타임은 `codex-validate-plan`/`codex-review-code` 결과를 우선 반영 후 미해결 차단 항목만 질문
- Build-only boundary: upstream 제품 정의가 없으면 build 체인 안에서 제품 산출물을 임의 생성하지 말고 `product-orchestrator`로 라우팅
- Product-package handoff: `PLAN.md` + `tasks/*.md`가 있으면 이를 planning source of truth로 보고 `requirements-analyzer` / `context-builder`를 생략
- `document-memory-policy.md` 준수
