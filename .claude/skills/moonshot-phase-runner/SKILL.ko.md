---
name: moonshot-phase-runner
description: Master plan 기반 phase별 구현 자동화 - 계획 검증 및 실행 준비
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Moonshot Phase Runner

## Role

Master plan 문서를 기반으로 phase별 구현을 준비합니다.
계획 검증, 불확실성 해소(Q&A), 그리고 **실행 준비**를 담당합니다.
또한 `/moonshot-orchestrator`가 재개할 수 있도록 핸드오프 메타데이터를 반환합니다.

실행 모드:
- `delegated-terminal`: `agent-loop.sh` 기반의 격리 루프 실행 사용
- `in-session-coordinator`: 현재 세션이 루프를 조율하되, 각 시도는 fresh fork/sub-agent round로 실행

실행 시작 정책:
- 기본값: 준비가 끝나면 즉시 실행까지 자동 시작
- `--prepare-only`: 상태만 준비하고 실행 메타데이터만 반환

## Usage

```bash
# 계획 디렉토리 지정
/moonshot-phase-runner docs/implementation/

# 자율 모드 (Q&A 스킵)
/moonshot-phase-runner docs/implementation/ --autonomous

# 현재 세션에서 조율만 유지
/moonshot-phase-runner docs/implementation/ --execution-mode in-session-coordinator

# 준비만 하고 자동 실행은 하지 않음
/moonshot-phase-runner docs/implementation/ --prepare-only
```

## Workflow

```
/moonshot-phase-runner <plan-dir> [--autonomous] [--execution-mode <mode>] [--prepare-only]
    │
    ├─ 1. Plan Directory 검증
    │      └─ Master plan + phase 문서 확인
    │
    ├─ 2. phase-status.yaml 생성/업데이트
    │      └─ 각 phase 상태 초기화
    │
    ├─ 3. execution bridge 아티팩트 시드
    │      └─ `execution/<phase>/SPRINT_CONTRACT.md`
    │         와 `QA_REPORT.md`, `HANDOFF.md` placeholder 준비
    │
    ├─ 4. Plan Review (--autonomous 미지정 시)
    │      └─ 불확실성 감지 → Q&A → planConfirmed: true
    │
    ├─ 5. 실행 모드 결정
    │      ├─ delegated-terminal -> dispatcher 명령 구성
    │      └─ in-session-coordinator -> fresh attempt 명령 구성
    │
    ├─ 6. 실행 스킬 자동 시작 (기본값)
    │      └─ `--prepare-only`가 아니면 현재 세션에서
    │         `moonshot-phase-executor`를 즉시 실행
    │
    └─ 7. 핸드오프 요약 반환
           └─ 오케스트레이터가 읽을 수 있는 phaseRunnerResult 반환
```

## Step 1: 계획 디렉토리 검증

```yaml
validation:
  - 디렉토리 존재 확인
  - Master plan 찾기 (00-master-plan.md 또는 *master*.md)
  - Phase 문서 개수 확인

output:
  success: "✅ {N}개 phase 발견: {plan-dir}"
  failure: "❌ Master plan을 찾을 수 없음"
```

## Step 2: phase-status.yaml 생성

`.claude/docs/phase-status.yaml` 파일 생성:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionMode: "in-session-coordinator"
executionRoot: "docs/implementation/execution"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
    attempts:
      total: 0
      lastOutcome: pending
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

## Step 3: Execution Bridge 아티팩트 시드

각 phase마다 아래를 준비합니다.
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`

규칙:
- `SPRINT_CONTRACT.md`는 phase 제목과 문서 경로를 바탕으로 초기 생성
- `QA_REPORT.md`, `HANDOFF.md`는 실행 중 갱신될 placeholder로 시작
- 이미 작업 내용이 있는 파일은 덮어쓰지 않음

## Step 4: Plan Review (선택적)

`--autonomous` 플래그가 **없을 때**만 실행:

```yaml
actions:
  1. 각 phase 문서 로드
  2. /moonshot-detect-uncertainty 호출
  3. 불확실성 발견 시:
     - 질문 표시
     - 사용자 답변 대기
     - phase 문서 업데이트
  4. planConfirmed: true 설정
```

`--autonomous` 플래그가 **있을 때**:
- Q&A 스킵
- 모든 phase를 planConfirmed: true로 설정
- 자율 판단 모드로 진행

## Step 5: 실행 모드 결정

지원 값:
- `delegated-terminal` (기본값): `agent-loop.sh` 외부 루프 사용
- `in-session-coordinator`: 현재 세션이 재시도를 조율하되, 각 시도는 격리 실행

### Mode A: delegated-terminal

**내부 adapter 명령:**

```
═══════════════════════════════════════════════════════════════
  ✅ 준비 완료
═══════════════════════════════════════════════════════════════

📋 Plan: docs/implementation/00-master-plan.md
📦 Phases: 5개
🤖 Mode: Autonomous

───────────────────────────────────────────────────────────────
  내부 adapter:
───────────────────────────────────────────────────────────────

  .claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode delegated-terminal --execution-root docs/implementation/execution --runtime auto

───────────────────────────────────────────────────────────────

💡 Tip: 실행 후 로그는 .claude/logs/agent-loop/ 에서 확인
```

### Mode B: in-session-coordinator

이 모드는 오케스트레이션은 현재 세션에 남기고, 각 시도는 fresh attempt로 분리합니다.

Coordinator 규칙:
- 메인 세션은 다음 시도를 결정할 수 있지만, 구현 중간 대화를 계속 누적하면 안 됩니다.
- 각 시도는 아래 아티팩트 상태만 입력으로 시작합니다.
  - phase 문서
  - `SPRINT_CONTRACT.md`
  - 최신 `QA_REPORT.md`
  - 있으면 최신 `HANDOFF.md`
- 각 시도는 fresh fork/sub-agent round로 실행해야 합니다.
- 메인 세션으로는 verdict, changed files, failed checks, next action 같은 요약만 병합합니다.
- 시도가 clean completion 없이 끝나면 다음 시도 전에 `QA_REPORT.md`와 `HANDOFF.md`를 갱신합니다.

Attempt 계약:

```yaml
attemptInput:
  phaseNumber: 1
  phaseTitle: "Project Setup"
  phaseDoc: "docs/implementation/01-project-setup.md"
  sprintContractPath: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  priorAttemptSummary: "Build failed on migration ordering; retry with DB init fix"

attemptResult:
  status: "partial"
  summary: "Backend boots, but login flow still fails under E2E"
  changedFiles: ["src/api/auth.ts", "tests/e2e/login.spec.ts"]
  verification:
    verdict: "failed"
    failedChecks: ["browserFlows.login"]
  handoffRequired: true
```

즉 메인 세션에서 루프를 돌릴 수는 있지만, 실제 구현/검증은 반드시 이런 fresh attempt 안에서 일어나야 합니다.

## Step 6: 실행 스킬 자동 시작 (기본값)

`--prepare-only`가 아니면:
- `moonshot-phase-executor`를 현재 세션에서 즉시 실행합니다.
- `phaseRunnerResult`를 그대로 handoff payload로 넘깁니다.
- command adapter는 skill 경계 뒤에 숨깁니다.

`--prepare-only`인 경우:
- artifact와 `phase-status.yaml`만 준비하고 멈춥니다.
- 이후 수동 또는 downstream용 실행 메타데이터만 반환합니다.

## Step 7: 핸드오프 요약 반환

오케스트레이터용 구조화 요약을 반환:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: in-session-coordinator
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  executionRuntime: "auto"
  executionSkill: "moonshot-phase-executor"
  executionCommand: ".claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionAdapterCommand: ".claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionCoordinatorSkill: "moonshot-in-session-coordinator"
  coordinatorPolicy: "fresh-fork-per-attempt"
  autoStartExecution: true
  prepareOnly: false
  pendingPhases: 5
```

모드 의미:
- `delegated-terminal`: command-layer adapter 명령을 출력
- `in-session-coordinator`: 상태만 준비하고, 현재 런타임/오케스트레이터가 각 시도를 fresh fork로 실행

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionMode: "delegated-terminal"
executionRoot: "docs/implementation/execution"
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
    attempts:
      total: 1
      lastOutcome: failed
      lastUpdatedAt: "2026-02-08T15:30:00Z"
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core UI"
    status: pending
    planConfirmed: true
```

## References

- `/moonshot-orchestrator`: Phase 구현 위임
- `/moonshot-detect-uncertainty`: 사전 불확실성 감지
- `.claude/scripts/moonshot-phase-dispatch.sh`: 두 execution mode를 라우팅하는 command-layer dispatcher
- `.claude/scripts/agent-loop.sh`: `delegated-terminal` 내부 자율 실행 루프
- `/moonshot-in-session-coordinator`: `in-session-coordinator`용 fresh attempt coordinator

## 오케스트레이터 연동 계약

`/moonshot-orchestrator`에서 호출될 때:
1. 계획 상태를 준비하고 `.claude/docs/phase-status.yaml`을 작성합니다.
2. phase별 execution bridge 아티팩트를 없으면 생성합니다.
3. `executionMode`, `executionRoot`, artifact 경로를 포함한 `phaseRunnerResult` 요약만 반환합니다(phase 문서 본문 인라인 금지).
4. 여기서 구현 완료로 처리하지 않습니다.
5. `prepareOnly != true`이면 `phaseRunnerResult.executionSkill`을 즉시 실행하고 `phaseRunnerResult`를 입력으로 넘깁니다.
6. `prepareOnly == true`이면 준비된 실행 메타데이터만 반환하고 멈춥니다.
7. `executionMode == in-session-coordinator`이면 메인 세션을 얇게 유지하고 각 구현 round를 fresh fork/sub-agent attempt로 실행해야 합니다.
8. active attempt가 `phase-status.yaml`과 execution bridge 아티팩트를 갱신한 뒤에만 완료 검증을 재개합니다.
