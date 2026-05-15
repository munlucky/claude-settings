---
name: implementation-runner
description: 체인에서 실제 구현을 수행하고 완료 상태와 변경 파일을 `analysisContext`에 기록한다. 구현 단계에서 사용.
---

# 구현 실행

## 입력
- `analysisContext.request.userMessage`
- `analysisContext.request.taskType`
- `analysisContext.decisions.skillChain`
- `analysisContext.repo.openFiles`
- `analysisContext.codeReviewGraph.contextSummary`
- `analysisContext.codeReviewGraph.impactSummary`
- `analysisContext.codeReviewGraph.warnings`
- `analysisContext.artifacts.workflowGuidePath`
- `analysisContext.artifacts.designGuidePath`
- `analysisContext.artifacts.glossaryGuidePath`
- `analysisContext.artifacts.dailyGuidePath`
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- `analysisContext.artifacts.contextDocPath` (존재 시)
- `analysisContext.artifacts.planPath` / `taskSliceGlob` (존재 시)
- `analysisContext.artifacts.sprintContractPath` (execution bridge 적용 시)
- `analysisContext.artifacts.scorecardPath` (execution bridge 적용 시)

## 절차

### Step 0: 프로젝트 기준 문서 확인

코드 수정 전에 관련 프로젝트 기준 문서가 있으면 먼저 확인합니다.
- `workflow/README.md`: 브랜치/worktree/공식 프로세스 규칙
- `docs/design/README.md`: 공통 UI/패턴 규칙
- `docs/glossary/README.md`: 표준 명명
- `docs/daily/README.md`: 기록 규칙
- `TEST_GUIDE.md`: 검증 범위와 최소 실행 규칙
- 관련 `docs/analysis/*.md`: 대상 영역의 기존 분석

규칙:
- 명명, 구조, 테스트, 워크플로우 판단은 가능하면 이 문서 기준을 우선합니다.
- 관련 문서가 없으면 그 사실을 notes에 남기고, 정책을 지어내지 말고 기존 계약/컨텍스트 기준으로 진행합니다.

### Step 0.1: Execution Bridge 설정

코드 수정 전에 현재 라운드가 slice 단위 execution bridge 아티팩트를 요구하는지 먼저 판정합니다.

아래면 계약 문서를 먼저 만듭니다.
- `executionPlane == product_project`
- 그리고 `complexity != simple`이거나 `artifacts.sprintContractPath`가 이미 채워져 있음

필요 시:
1. `PLAN.md`, `tasks/*.md`, notes에서 active slice를 식별
2. `SPRINT_CONTRACT.md` 작성 또는 갱신
3. `SCORECARD.md` 작성 또는 갱신
4. 아래를 기록
   - round goal
   - 명시적 non-goal
   - done check
   - evaluator focus
   - 기대 evidence
   - objective score checklist와 target
   - policy anchors
5. 안전한 계약을 못 만들면 코드로 추측하지 말고 planning notes로 되돌립니다.

결과:
```yaml
signals.sprintContractReady: true | false
readiness.executionReady: true | false
notes:
  - "sprint-contract: ready, path=..."
  - "scorecard: ready, path=..."
```

### Step 0.2: Review / Closeout 선행조건

현재 실행이 phase execution bridge에 연결되어 있다면:
- 코드 변경 slice에서는 code review를 선택적 polish가 아니라 필수 workflow 단계로 취급합니다.
- slice가 `clean_finish`를 주장하려는 상태라면 `QA_REPORT.md`에 `Review completed: no`를 남기면 안 됩니다.
- closing slice의 `HANDOFF.md`, review checkpoint 필드, finish-closeout bullet은 placeholder 상태로 남기면 안 됩니다.
- review 또는 finish evidence가 비어 있으면 그 gap을 기록하고, 구현 완료인 척하지 말고 retry/remediation 흐름을 유지해야 합니다.

### Step 0.3: Code Review Graph 대상 축소

코드 수정 전에 구조 분석이 필요한 작업이면 `.claude/docs/guidelines/code-review-graph-workflow.md`를 적용합니다.
- 넓은 파일 집합을 열기 전에 `analysisContext.codeReviewGraph.contextSummary`와 `impactSummary`를 먼저 읽습니다.
- graph가 `not_built` 또는 `stale`이고 현재 stage에 구조 분석이 실제로 필요하면 요청 범위 안에서 MCP build/update 또는 CLI fallback을 사용합니다.
- 요약 결과로 target files, likely dependencies, impact radius를 좁힙니다.
- CRG를 사용할 수 없으면 warning을 기록하고 일반 bounded file inspection으로 진행합니다.
- raw graph output이나 `.code-review-graph/` 내용은 구현 notes에 붙이지 않습니다.

### Step 1: 테스트 환경 감지

구현 시작 전, 대상 프로젝트에 테스트 환경이 있는지 확인합니다.

```yaml
testEnvironmentCheck:
  configFiles:
    - "jest.config.*"
    - "vitest.config.*"
    - "playwright.config.*"
    - "pytest.ini"
    - "pyproject.toml [tool.pytest]"
  packageJson: "scripts.test != 기본 에러 메시지"
  testFiles: "**/*.test.* | **/*.spec.* | __tests__/ | tests/"

result:
  signals.testEnvironmentDetected: true | false
  signals.testFramework: "{감지됨}" | null
```

`testEnvironmentDetected = false`이면 테스트 동시 작성은 경고와 함께 건너뜁니다.

### 모든 작업
1. 요구사항, 컨텍스트, `SPRINT_CONTRACT.md`가 있으면 그 계약까지 확인합니다.
2. 관련 프로젝트 기준 문서가 있으면 함께 확인합니다.
3. active slice 기준으로 변경 범위를 정리하고 실제 구현을 수행합니다.
4. 변경 파일 목록과 핵심 변경 요약을 기록합니다.
5. 구현 완료 상태를 `analysisContext`에 반영합니다.
6. 테스트 환경이 있으면 테스트도 함께 작성합니다.
7. execution bridge가 요구되면 `SCORECARD.md`를 현재 상태에 맞게 갱신합니다.

### 리팩토링 작업
- 시작 전에 IN SCOPE / OUT OF SCOPE를 확인합니다.
- baseline 빌드 오류를 분리합니다.
- 단계별로 검증하고, 새 오류만 추적합니다.
- 빌드 실패 시 단계당 최대 2회 self-healing을 시도합니다.

### Step 5: 테스트 동시 작성

`signals.testEnvironmentDetected = true`일 때만 수행합니다.

```yaml
testCoCreation:
  unitTests:
    scope: "새로 추가 또는 크게 수정된 함수"
    minimum: 기능당 1개
  integrationTests:
    scope: "새 API 엔드포인트 또는 사용자 흐름"
    minimum: 흐름당 1개
  bugfixTests:
    scope: "수정 중인 각 버그"
    requirement: "수정 전에 재현 테스트 먼저 작성"
```

## 출력
```yaml
signals.implementationComplete: true
signals.testEnvironmentDetected: true | false
signals.testsWritten: true | false
signals.sprintContractReady: true | false
signals.selfHealingAttempts: 2
repo.changedFiles:
  - src/...
  - src/__tests__/...
notes:
  - "sprint-contract: ready, path=..."
  - "scorecard: ready, path=..."
  - "구현: 완료, 변경 파일=3, 테스트 작성=2"
  - "test-env: detected=true, framework=vitest"
```

## 규칙
- 다른 스킬/서브에이전트를 호출하지 않습니다.
- 실패하거나 보류할 경우 `notes`에 사유를 기록합니다.
- execution bridge가 요구되면 `SPRINT_CONTRACT.md`를 생략하지 않습니다.
- execution bridge가 요구되면 `SCORECARD.md`도 생략하지 않습니다.
- 리팩토링 작업은 시작 전 항상 스코프를 확인합니다.
- Self-healing은 사용자에게 묻기 전 단계당 최대 2회 재시도합니다.
- 테스트 환경이 있으면 테스트 없는 구현은 미완료 상태로 취급합니다.
