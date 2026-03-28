---
name: moonshot-phase-runner
description: 준비된 plan package를 기준으로 large, phase 기반, long-running 구현 작업을 실행할 때 사용합니다.
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

이 스킬은 large, phase 기반, long-running 구현 작업의 기본 공개 진입점입니다.
phase 중심 실행에서는 Intake에서 Plan으로 넘어가는 기본 소유자입니다.

실행 모드:
- `delegated-terminal`: `agent-loop.sh` 기반의 실제 자율 루프를 사용하며, 중단 없이 끝까지 밀어야 하는 실행에 우선 사용
- `in-session-coordinator`: 현재 세션이 루프를 조율하되, 각 시도는 fresh fork/sub-agent round로 실행하며, 기본 자율 실행보다는 얇은 interactive coordinator 모드로 취급

실행 시작 정책:
- 기본값: 준비가 끝나면 즉시 실행까지 자동 시작
- `--prepare-only`: 상태만 준비하고 실행 메타데이터만 반환

## Usage

```bash
# 기존 계획을 자동 탐색하거나 docs/implementation을 자동 생성
/moonshot-phase-runner

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
/moonshot-phase-runner [<plan-dir>] [--autonomous] [--execution-mode <mode>] [--prepare-only]
    │
    ├─ 1. Plan Directory 결정
    │      ├─ `<plan-dir>`가 있으면 그대로 사용
    │      ├─ 없으면 안전한 기존 plan dir를 자동 재사용
    │      └─ 없으면 `moonshot-plan-writer`로 `docs/implementation` 생성
    │
    ├─ 2. Plan Directory 검증
    │      └─ Master plan + phase 문서 확인
    │
    ├─ 3. phase-status.yaml 생성/업데이트
    │      └─ 각 phase 상태 초기화
    │
    ├─ 4. execution bridge 아티팩트 시드
    │      └─ `execution/<phase>/SPRINT_CONTRACT.md`
    │         와 `QA_REPORT.md`, `HANDOFF.md` placeholder 준비
    │
    ├─ 5. Plan Review (--autonomous 미지정 시)
    │      └─ 불확실성 감지 → Q&A → planConfirmed: true
    │
    ├─ 6. 실행 모드 결정
    │      ├─ delegated-terminal -> dispatcher 명령 구성
    │      └─ in-session-coordinator -> fresh attempt 명령 구성
    │
    ├─ 7. 실행 스킬 자동 시작 (기본값)
    │      └─ `--prepare-only`가 아니면 현재 세션에서
    │         `moonshot-phase-executor`를 즉시 실행
    │
    └─ 8. 핸드오프 요약 반환
           └─ 오케스트레이터가 읽을 수 있는 phaseRunnerResult 반환
```

## Step 1: 계획 디렉토리 결정

`<plan-dir>`가 없으면 아래 순서로 결정합니다.

1. `.claude/docs/phase-status.yaml`의 active plan이 유효하면 재사용
2. `docs/implementation`에 유효한 master plan과 phase 문서가 있으면 재사용
3. 다른 implementation-plan 후보가 정확히 1개만 안전하게 발견되면 재사용
4. 그 외에는 `/moonshot-plan-writer`를 실행해 `docs/implementation`을 생성/갱신

안전 규칙:
- 후보가 여러 개이고 active plan이 명확하지 않으면 추측하지 말고 사용자에게 물어야 합니다.

결정 결과:

```yaml
planResolution:
  source: "phase-status"   # explicit | phase-status | discovered | plan-writer
  planDir: "docs/implementation"
  masterPlan: "docs/implementation/00-master-plan-v1.md"
```

## Step 2: 계획 디렉토리 검증

```yaml
validation:
  - 디렉토리 존재 확인
  - Master plan 찾기 (00-master-plan.md 또는 *master*.md)
  - Phase 문서 개수 확인

output:
  success: "✅ {N}개 phase 발견: {plan-dir}"
  failure: "❌ Master plan을 찾을 수 없음"
```

## Step 3: phase-status.yaml 생성

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

## Step 4: Execution Bridge 아티팩트 시드

각 phase마다 아래를 준비합니다.
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`

규칙:
- `SPRINT_CONTRACT.md`는 phase 제목과 문서 경로를 바탕으로 초기 생성
- execution 아티팩트는 `.claude/templates/execution/` 아래 템플릿을 기준으로 시드한다
- `SPRINT_CONTRACT.md`에는 항상 로드 규칙, 활성 워크스페이스 계약, verification contract, round별 추가 가이드를 담는 `Policy Anchors` 섹션이 있어야 함
- `SPRINT_CONTRACT.md`에는 round의 downstream stage 순서, review cadence, finish/handoff 종료 규칙도 드러나야 함
- `QA_REPORT.md`, `HANDOFF.md`는 실행 중 갱신될 placeholder로 시작
- `QA_REPORT.md`는 다음 경로가 clean finish, retry loop, resume-later handoff 중 무엇인지 분명히 남겨야 함
- `HANDOFF.md`는 closeout 전에 어떤 review/verification 체크를 다시 돌려야 하는지 남겨야 함
- 이미 작업 내용이 있는 파일은 덮어쓰지 않음

## Step 5: Plan Review (선택적)

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

## Step 6: 실행 모드 결정

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
fresh-attempt 루프를 런타임이 직접 강제하지 못하면, 이 모드는 무중단 자율 실행보다 대화형/핸드오프 중심 동작에 가깝습니다.

Coordinator 규칙:
- 메인 세션은 다음 시도를 결정할 수 있지만, 구현 중간 대화를 계속 누적하면 안 됩니다.
- 각 시도는 아래 아티팩트 상태만 입력으로 시작합니다.
  - phase 문서
  - `SPRINT_CONTRACT.md`
  - 최신 `QA_REPORT.md`
  - 있으면 최신 `HANDOFF.md`
- `SPRINT_CONTRACT.md` 의 policy anchors 는 선택 메모가 아니라 필수 round 입력으로 취급합니다.
- 각 round 안에서도 `ready/isolate -> execute -> review -> verify -> finish/handoff` 순서를 눈에 보이게 유지합니다.
- 각 시도는 fresh fork/sub-agent round로 실행해야 합니다.
- 메인 세션으로는 verdict, changed files, failed checks, next action 같은 요약만 병합합니다.
- review, verification, finish-stage closeout이 모두 충족되기 전에는 phase를 clean completion으로 취급하지 않습니다.
- 시도가 clean completion 없이 끝나면 다음 시도 전에 `QA_REPORT.md`와 `HANDOFF.md`를 갱신합니다.

런타임 메모:
- `delegated-terminal`은 `agent-loop.sh`라는 구체적인 셸 루프를 가지므로, 사용자가 "알아서 끝까지 계속"을 기대할 때 우선 선택해야 합니다.
- `in-session-coordinator`는 현재 런타임이 coordinator 계약을 제대로 수행해야 이어서 진행되며, 그렇지 않으면 resumable handoff를 남기고 멈춘 것처럼 보일 수 있습니다.

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

## Step 7: 실행 스킬 자동 시작 (기본값)

`--prepare-only`가 아니면:
- `moonshot-phase-executor`를 현재 세션에서 즉시 실행합니다.
- `phaseRunnerResult`를 그대로 handoff payload로 넘깁니다.
- command adapter는 skill 경계 뒤에 숨깁니다.

`--prepare-only`인 경우:
- artifact와 `phase-status.yaml`만 준비하고 멈춥니다.
- 이후 수동 또는 downstream용 실행 메타데이터만 반환합니다.

## Step 8: 핸드오프 요약 반환

오케스트레이터용 구조화 요약을 반환:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: in-session-coordinator
  planResolutionSource: "plan-writer"
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
- `/moonshot-plan-writer`: 안전한 plan dir가 없을 때 fallback 생성
- `/moonshot-detect-uncertainty`: 사전 불확실성 감지
- `.claude/scripts/moonshot-phase-dispatch.sh`: 두 execution mode를 라우팅하는 command-layer dispatcher
- `.claude/scripts/agent-loop.sh`: `delegated-terminal` 내부 자율 실행 루프
- `/moonshot-in-session-coordinator`: `in-session-coordinator`용 fresh attempt coordinator

## 오케스트레이터 연동 계약

`/moonshot-orchestrator`에서 호출될 때:
1. 먼저 `<plan-dir>`를 결정하고, 안전한 plan이 없으면 `/moonshot-plan-writer`로 `docs/implementation`을 생성합니다.
2. 계획 상태를 준비하고 `.claude/docs/phase-status.yaml`을 작성합니다.
3. phase별 execution bridge 아티팩트를 없으면 생성합니다.
4. `executionMode`, `executionRoot`, artifact 경로를 포함한 `phaseRunnerResult` 요약만 반환합니다(phase 문서 본문 인라인 금지).
5. 여기서 구현 완료로 처리하지 않습니다.
6. `prepareOnly != true`이면 `phaseRunnerResult.executionSkill`을 즉시 실행하고 `phaseRunnerResult`를 입력으로 넘깁니다.
7. `prepareOnly == true`이면 준비된 실행 메타데이터만 반환하고 멈춥니다.
8. `executionMode == in-session-coordinator`이면 메인 세션을 얇게 유지하고 각 구현 round를 fresh fork/sub-agent attempt로 실행해야 합니다.
9. active attempt가 `phase-status.yaml`과 execution bridge 아티팩트를 갱신한 뒤에만 완료 검증을 재개합니다.
10. 각 phase 내부에서는 기본적으로 `ready/isolate -> execute -> review -> verify -> finish/handoff` 순서를 유지해야 합니다.
