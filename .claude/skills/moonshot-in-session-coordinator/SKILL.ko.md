---
name: moonshot-in-session-coordinator
description: 현재 세션에서 phase 루프를 조율하되 각 round는 fresh fork attempt agent로 실행한다.
triggers:
  - "in-session coordinator"
  - "phase coordinator"
  - "fresh attempt loop"
---

# Moonshot In-Session Coordinator

## 역할

현재 세션에서 phase 루프를 돌리되, 구현 대화가 메인 세션에 계속 쌓이지 않도록 조율합니다.
메인 세션은 얇은 coordinator로 남고, 실제 구현/검증 round는 항상 fresh `phase-attempt-agent`가 맡습니다.

사용 조건:
- `moonshot-phase-runner`가 `executionMode: in-session-coordinator`를 반환한 경우
- active phase의 execution artifact가 이미 준비된 경우

사용하지 말아야 하는 경우:
- 단발성 simple 구현
- 이미 `agent-loop.sh`를 쓰는 delegated terminal 실행

## 실행 책임

- 메인 세션:
  - 다음 phase 선택
  - 최소 `attemptInput` 구성
  - fresh fork attempt 생성
  - 요약 결과만 병합
  - `phase-status.yaml` 갱신
- attempt:
  - `phaseAttemptMode`로 `moonshot-orchestrator` 실행
  - `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` 갱신
  - 요약된 `attemptResult` 반환

## 입력

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator"
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  coordinatorPolicy: "fresh-fork-per-attempt"

options:
  maxAttemptsPerPhase: 3
  stopOnFailure: true
```

## Workflow

### 1. phase 상태 로드

`phase-status.yaml`을 읽고 다음 actionable phase를 선택합니다.
- `status == pending`
- 또는 `status == in_progress`
- 또는 재시도 여유가 있는 `status == failed`

건너뛸 대상:
- 이미 `completed`
- `planConfirmed`가 아직 아닌 phase

### 2. 최소 attempt 입력 구성

시도 입력은 아티팩트 기반 상태만 사용합니다.

```yaml
attemptInput:
  phaseAttemptMode: true
  phaseNumber: 2
  phaseTitle: "Core Implementation"
  planDir: "docs/implementation/"
  phaseDocPath: "docs/implementation/02-core-implementation.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  sprintContractPath: "docs/implementation/execution/02-core-implementation/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/02-core-implementation/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/02-core-implementation/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/02-core-implementation/SCORECARD.md"
  worksetPath: "docs/implementation/execution/02-core-implementation/WORKSET.md"
  executionRoot: "docs/implementation/execution"
  priorAttemptSummary: "E2E login flow failed after API refactor"
```

규칙:
- 긴 phase 문서를 메인 세션에 인라인하지 않습니다.
- 이전 구현 대화를 다시 넘기지 않습니다.
- 재시도 메모리는 `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`만 사용합니다.
- `SPRINT_CONTRACT.md`의 policy anchors와 필수 검증 명령은 attempt 입력의 필수 항목으로 취급합니다.
- `SCORECARD.md`를 phase의 객관적인 완료 상태로 사용합니다.
- `WORKSET.md`에는 현재 목표, 필수 읽기 문서, 생성 아티팩트, 미해결 리스크를 계속 유지합니다.

### 3. fresh attempt 생성

`phase-attempt-agent`를 fresh fork/sub-agent로 실행합니다.

```yaml
Task tool:
  agent: phase-attempt-agent
  subagent_type: general-purpose
  input: attemptInput
```

### 4. 요약 결과만 병합

기대 반환 형식:

```yaml
attemptResult:
  status: "completed"
  verification:
    verdict: "passed"
    evidenceFresh: true
    requiredChecks:
      missing: []
    failedChecks: []
  score:
    current: 100
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: "done"
  changedFiles:
    - "src/api/auth.ts"
  summary: "Phase goal met and verification passed"
  handoffRequired: false
```

메인 세션 병합 규칙:
- `status`, `summary`, `changedFiles`, `handoffRequired`만 유지합니다.
- 상태 전이에 필요한 verifier 메타데이터도 최소한 병합합니다.
  - `verification.verdict`
  - `verification.evidenceFresh`
  - `verification.contractApplicable`
  - `verification.mode`
  - `verification.requiredChecks.missing`
  - `verification.failedChecks`
- 상태 전이에 필요한 score 메타데이터도 병합합니다.
  - `score.current`
  - `score.target`
  - `score.unmetChecklistItems`
  - `score.blockingDefects`
  - `score.verdict`
- raw log나 전체 verifier 출력은 병합하지 않습니다.
- 형식상 `status: completed`여도 score verdict가 `done`이 아니면 유효한 완료로 취급하지 않습니다.

### 5. phase-status.yaml 갱신

매 시도 후:
- `attempts.total` 증가
- `attempts.lastOutcome` 갱신
- `attempts.lastUpdatedAt` 갱신
- phase `status` 갱신
  - verification passed + `evidenceFresh == true` + required check 누락 없음 + `score.verdict == done`일 때만 `completed`
  - retry cap 도달 시 `failed`
  - 재시도 가능하면 `in_progress`

### 상태 전이 표

| Attempt result | Coordinator 동작 |
|---|---|
| `completed` + 최신 증거 + required check 누락 없음 + `score.verdict=done` | phase를 `completed`로 변경 |
| `partial` | phase를 `in_progress`로 유지 |
| `failed` + 재시도 가능 | phase를 `in_progress`로 유지하고 재시도 |
| `failed` + 재시도 불가 | phase를 `failed`로 변경 |
| 형식상 `completed`이지만 최신 증거가 없거나 score가 `done`이 아님 | `in_progress` 또는 `failed`로 강등 |

### 6. 반복 또는 중단

- phase가 통과하면 다음 actionable phase로 진행합니다.
- 형식상 pass처럼 보여도 최신 증거가 없거나 score verdict가 `done`이 아니면 다음 phase로 넘기지 않습니다.
- 실패했지만 재시도 여유가 있으면 새 `phase-attempt-agent`를 다시 생성합니다.
- 실패했고 재시도도 소진했으면:
  - `stopOnFailure == true`면 중단
  - `HANDOFF.md`는 최신 상태로 남깁니다.
- 모든 phase가 끝나면 성공 요약을 반환합니다.

## 출력

```yaml
coordinatorResult:
  status: "partial"
  completedPhases:
    - 1
  stoppedAtPhase: 2
  attemptsRun: 3
  retryCapReached: false
  handoffRequired: true
  summary:
    - "phase 1 completed"
    - "phase 2 retry pending: browserFlows.login"
```

## 계약

- 이 스킬은 coordinator 전용이며, 직접 구현 worker가 되면 안 됩니다.
- 모든 재시도는 fresh `phase-attempt-agent`로 실행해야 합니다.
- coordinator 세션은 round 사이에 summary-only 상태를 유지합니다.
- 재시도 근거는 누적 채팅 컨텍스트가 아니라 `QA_REPORT.md` / `HANDOFF.md` / `SCORECARD.md` / `WORKSET.md`여야 합니다.
- attempt agent는 재귀적 `moonshot-phase-runner` 삽입을 피하기 위해 반드시 `phaseAttemptMode=true`로 `moonshot-orchestrator`를 실행해야 합니다.
- strict/meta-harness 작업에서는 active `SPRINT_CONTRACT.md`에 policy anchors가 없으면 새 attempt를 시작하지 않습니다.
- `attemptResult.status=completed`라도 해당 시도의 verifier evidence가 최신이고 contract 기준으로 완전하며 score도 완료일 때만 phase 완료로 반영합니다.

## References

- `.claude/agents/phase-attempt-agent.md`
- `/moonshot-phase-runner`
- `/moonshot-orchestrator`
