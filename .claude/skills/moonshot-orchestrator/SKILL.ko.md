---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동으로 실행한다.
---

# PM 오케스트레이터

## 역할
PM 분석 스킬들을 순차적으로 실행하고 최종 에이전트 체인을 구성하는 오케스트레이터.

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
  verificationScript: .claude/agents/verification/verify-changes.sh
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
- 메모리 없음: `boundaryStatus: "not_initialized"`, 계속 진행
- MCP 불가: `boundaryStatus: "not_checked"`, 경고 후 진행

#### 2.1 작업 분류
`/moonshot-classify-task` 실행 → patch 병합 (taskType, keywords, signals)

#### 2.2 복잡도 평가
`/moonshot-evaluate-complexity` 실행 → patch 병합 (complexity, estimates)

#### 2.3 불확실성 검출
`/moonshot-detect-uncertainty` 실행 → patch 병합 (missingInfo)

#### 2.4 불확실성 처리
`missingInfo`가 비어있지 않으면:
1. `AskUserQuestion`으로 질문 생성 (priority HIGH 우선)
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
| `project-memory-agent` | Task (fork) | 컨텍스트 격리 |
| `requirements-analyzer` | Task | |
| `context-builder` | Task | |
| `codex-validate-plan` | Skill | |
| `implementation-runner` | Task | |
| `code-simplifier` | Plugin | 구현 후 코드 간소화 |
| `completion-verifier` | Skill (fork) | 테스트 환경 자동 감지 |
| `doc-auto-sync` | Skill | 문서 자동 동기화 및 부트스트랩 |
| `codex-review-code` | Skill | |
| `project-memory-reviewer` | Task (fork) | 컨텍스트 격리 |
| `vercel-react-best-practices` | Skill | reactProject=true 시 |
| `security-reviewer` | Skill | |
| `build-error-resolver` | Skill | |
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
| `requirements-analyzer` | general-purpose | |
| `context-builder` | context-builder | |
| `implementation-runner` | implementation-agent | |
| `project-memory-reviewer` | general-purpose | fork, codex-review-code 후 |
| `team-leader-agent` | general-purpose | fork, --use-teams 시 |

**실행 규칙:**
1. 순차 실행 (`parallelGroups` 내에서만 병렬)
2. Skill → `Skill` 도구, Agent → `Task` 도구, Plugin → `Plugin` 도구, Script → `Bash` 도구
3. 미정의 단계 → 사용자에게 확인 후 중단
4. 모든 단계는 `document-memory-policy.md` 준수

**Agent Teams 연동 (--use-teams):**
1. `signals.useAgentTeams = true` 설정
2. `team-leader-agent`를 팀 설정과 함께 fork (팀 상세는 `moonshot-teams-runner/SKILL.md` 참조)
3. 요약된 `teamReport`를 `analysisContext.notes`에 병합

> [!CAUTION]
> Agent Teams: ~13K 토큰 (2명) / ~20K 토큰 (3명). 중요한 리뷰나 복잡한 구현에만 사용.

**Fork 기반 에이전트** (`project-memory-agent`, `project-memory-reviewer`, `team-leader-agent`):
- 별도 컨텍스트 세션에서 실행
- 요약된 결과만 반환 → 메인 세션 컨텍스트 오염 방지

### 3.1 동적 스킬 삽입

| 시그널 | 트리거 | 액션 |
|--------|--------|------|
| `buildFailed` | Bash exit code ≠ 0 | `build-error-resolver` 삽입 후 재시도 (최대 2회) |
| `securityConcern` | `.env`/`auth`/`token`/`secret` 파일 변경 | codex-review-code 후 `security-reviewer` 추가 |
| `coverageLow` | completion-verifier: 커버리지 < 80% | 경고 로깅, 추가 테스트 요청 |
| `reactProject` | `.tsx`/`.jsx` 파일 또는 React 키워드 | codex-review-code 후 `vercel-react-best-practices` 삽입 |
| `implementationComplete` | implementation-runner 완료 | completion-verifier 전 `code-simplifier` 삽입 |
| `docStale` | pre-flight-check에서 stale 문서 감지 | 체인 시작 부분에 `doc-auto-sync` 삽입 |
| `newProject` | ARCHITECTURE.md 없음 + 복잡한 태스크 | 체인 시작 부분에 `doc-auto-sync --init` 삽입 |
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
1. `completion-verifier` 호출
2. `allPassed: true` → `implementationComplete: true` 설정, 진행
3. `allPassed: false` + retryCount < 2 → 실패 Phase로 돌아가 코드만 수정, 재시도
4. `allPassed: false` + retryCount ≥ 2 → 사용자에게 개입 요청

### 3.4 Fix Forward 사후 리뷰

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
- 사용자 질문: `AskUserQuestion` 도구
- `document-memory-policy.md` 준수
