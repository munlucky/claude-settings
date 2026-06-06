---
name: moonshot-in-session-coordinator
description: 현재 세션에서 phase 루프를 조율하되 각 round는 fresh fork attempt agent로 실행한다.
surfaceStatus: internal_stage_owner
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
- `moonshot-phase-runner` 없는 기본 사용자-facing phase 실행. 이 스킬은 phase runner 뒤의 active executor이며, delegated-terminal은 legacy compatibility 전용입니다.

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
  phaseStatusFile: ".moonshot-relay/docs/phase-status.yaml"
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
  phaseStatusFile: ".moonshot-relay/docs/phase-status.yaml"
  sprintContractPath: "docs/implementation/execution/02-core-implementation/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/02-core-implementation/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/02-core-implementation/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/02-core-implementation/SCORECARD.md"
  worksetPath: "docs/implementation/execution/02-core-implementation/WORKSET.md"
  executionRoot: "docs/implementation/execution"
  priorAttemptSummary: "E2E login flow failed after API refactor"
  projectKnowledgeContext:
    schemaVersion: 1
    stage: "execute"
    status: "ready|degraded_read|degraded_write|not_configured|stale"
    strictness: "advisory|required"
    promptBlock: "## Project Knowledge Context\n..."
```

규칙:
- 긴 phase 문서를 메인 세션에 인라인하지 않습니다.
- 이전 구현 대화를 다시 넘기지 않습니다.
- 각 fresh attempt 전에 `projectKnowledgeContext`를 `stage=execute`로 build 또는 refresh하고, typed summary block과 status metadata만 넘깁니다.
- `.moonshot-relay/docs/ko/`와 system/developer/AGENTS/rules 정책 중복 항목은 attempt input에서 제외합니다.
- 재시도 메모리는 `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`만 사용합니다.
- `SPRINT_CONTRACT.md`의 policy anchors와 필수 검증 명령은 attempt 입력의 필수 항목으로 취급합니다.
- `SCORECARD.md`를 phase의 객관적인 완료 상태로 사용합니다.
- `WORKSET.md`에는 현재 목표, 필수 읽기 문서, 생성 아티팩트, 미해결 리스크를 계속 유지합니다.

Cross-runtime provider-neutral model contract:
- 시작값은 `modelEffortProfile: standard`입니다. `deep` 또는 `max`는 기록된 `Effort escalation reason`이 있을 때만 사용합니다.
- stage당 MemoryGraph/CodeReviewGraph 조회는 기본적으로 compact recall 1회로 제한하고, owner/date/path/API/schema/failure fact가 부족할 때만 반복합니다.
- assistant history를 replay할 때 assistant item의 `phase` 값을 보존합니다. 진행 업데이트는 `commentary`, return-boundary check 통과 뒤 최종 응답만 `final_answer`입니다.
- user message에는 phase metadata를 추가하지 않습니다.

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

반환 직전 self-check:
- 성공 요약이나 진행 요약을 반환하기 전에 `phase-status.yaml`을 다시 읽어 actionable phase가 남아 있는지 확인합니다.
- actionable phase가 남아 있으면 방금 끝낸 phase 보고를 반환 경계로 쓰지 말고 즉시 다음 phase 루프로 이어갑니다.
- phase 하나 완료, checkpoint 문서 갱신, 중간 진행 보고는 유효한 stop boundary가 아닙니다.
- `phase-status.yaml`에 `activeExecutionStatus: active`가 남아 있는 동안의 사용자 업데이트는 commentary/진행 보고 형태만 허용되며, `final`, closeout, 세션 종료처럼 들리는 표현을 쓰면 안 됩니다.
- Phase 01이 `completed`가 되었더라도 Phase 02 이후에 actionable phase가 남아 있으면, 아티팩트와 상태만 반영한 뒤 바로 Phase 02로 진입해야 하며 종료형 요약을 반환하면 안 됩니다.
- coordinator가 이 규칙을 어기고 0으로 조기 종료하더라도 dispatcher가 재시작하도록 설계되어야 하며, 그 상황 자체를 계약 위반으로 봅니다.

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
- clean success 반환 경계는 active plan directory 완료뿐입니다. actionable phase가 남아 있으면 진행 보고 대신 계속 실행합니다.
- completed phase milestone 하나만으로 `final` 응답을 내면 안 됩니다. coordinator는 다음 actionable phase로 이어가거나, 명시적 blocker/user pause를 기록한 경우에만 멈출 수 있습니다.
- actionable phase가 남아 있으면 plan-level 실행 상태는 `active` 또는 `paused`만 허용됩니다. `finished`를 기록하면 안 되고, `HANDOFF.md`에 `Stop reason: clean_finish`를 쓰면 안 됩니다.

## References

- `agents/phase-attempt-agent.md`
- `/moonshot-phase-runner`
- `/moonshot-orchestrator`

## Project Knowledge Context Contract

각 fresh forked attempt 전에 `knowledge-context-build.mjs --stage execute --json`으로 `projectKnowledgeContext`를 갱신합니다. child prompt에는 `## Project Knowledge Context` block과 status-only metadata만 전달합니다.

`status=degraded_read` 또는 `not_configured`인 advisory degradation은 계속 진행합니다. strict memory task는 attempt spawn 전에 blocking metadata를 표면화해야 합니다. raw graph, raw ontology, raw log, transcript, secret-like string은 전달하지 않습니다.
