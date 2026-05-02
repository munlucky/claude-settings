# Codex Goal Gap Analysis

Last-Reviewed: 2026-05-02

## 역할

- targeted external-pattern assessment

이 문서는 Codex CLI `/goal`의 목표 지속 실행 모델을 현재 `claude-settings` Moonshot phase runner와 비교해, 이미 반영된 영역과 남은 갭을 정리한다.

## 입력 근거

외부 기준:

- OpenAI Codex changelog: persisted `/goal` workflows, app-server APIs, model tools, runtime continuation, TUI controls.
- `openai/codex` goal runtime PR: idle continuation, token/time accounting, interrupt/resume, budget soft stop, no-tool continuation suppression.
- `openai/codex` continuation prompt: objective를 user-provided data로 취급하고, 완료 전 prompt-to-artifact checklist와 실제 증거 audit을 요구.
- `thread_goals` migration: `thread_id`, `goal_id`, `objective`, `status`, `token_budget`, `tokens_used`, `time_used_seconds`를 persisted state로 둠.

로컬 기준:

- `.claude/skills/moonshot-phase-runner/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/verification.contract.yaml`
- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/agent-loop-phase-runner.mjs`
- `.claude/scripts/agent-loop-phase-runtime.mjs`
- `.claude/scripts/agent-loop-phase-state.mjs`
- `.claude/scripts/phase-run-lease.mjs`
- `.claude/scripts/agent-loop-phase-plan-lib.mjs`
- `.claude/templates/execution/*.md`

## 결론

현재 Moonshot phase runner는 `/goal`의 핵심 철학 중 절반 이상을 이미 다른 형태로 갖고 있다.

강한 부분:

- plan-directory 단위 지속 실행
- phase 상태 저장
- delegated-terminal autonomous loop
- retry / timeout / fallback
- lease 기반 return-boundary guard
- `SPRINT_CONTRACT -> QA_REPORT -> SCORECARD -> HANDOFF` 증거 체계
- fresh verification, review, closeout gate

남은 핵심 갭:

- objective 중심 `GoalState`가 1급 엔티티가 아님
- token/time accounting이 goal 상태로 누적되지 않음
- pause/resume/clear 같은 사용자 제어 API가 약함
- continuation이 runtime idle lifecycle이 아니라 외부 while-loop/process restart 중심임
- no-tool/no-artifact 반복 억제가 명시적인 상태로 분리돼 있지 않음
- stale update 보호가 goal_id 단위가 아니라 lease/phase 상태 중심임

따라서 `/goal`을 그대로 복제하기보다, 현재 phase runner 위에 `SQLite GoalEnvelope + Accounting + User Control + Loop Suppression`을 얇게 얹는 방향이 맞다. DB는 runtime state의 source of truth이고, `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, verification report는 human/audit artifact source of truth로 유지한다.

## 구조 비교

| Codex `/goal` 레이어 | 현재 Moonshot 대응 | 판정 |
|---|---|---|
| persisted goal state | `.claude/docs/phase-status.yaml`, execution artifacts | 부분 충족 |
| objective/status/budget/accounting row | 없음. phase/status와 artifacts에 분산 | 갭 |
| app-server API | 없음. command/script entrypoint 중심 | 갭 |
| model tools `get/create/update_goal` | 없음. worker prompt와 artifacts로 간접 제어 | 갭 |
| runtime continuation | `moonshot-phase-dispatch.mjs` + `agent-loop.mjs` | 충족, 방식 다름 |
| idle-only continuation | 없음. child process loop/restart 중심 | 갭 |
| token/time accounting | watchdog timeout, restart caps, logs | 부분 충족 |
| budget soft stop | timeout/retry cap stop reason | 부분 충족 |
| interrupt pause | signal closeout + handoff update | 부분 충족 |
| resume reactivation | resumable artifacts, phase status | 부분 충족 |
| no-tool continuation suppression | completion gate / phase did not advance guard | 부분 충족 |
| completion audit | `SCORECARD`, `QA_REPORT`, verification contract | 강함 |
| user control pause/resume/clear | stop reasons only, no first-class commands | 갭 |

## 상세 갭

### G1. Goal state가 phase state에 묻혀 있음

현재 `phase-status.yaml`은 phase 단위 진행 상태를 잘 저장한다. 하지만 `/goal`의 `objective`, `goal_id`, `status`, `token_budget`, `tokens_used`, `time_used_seconds`에 해당하는 목표 단위 상태는 없다.

영향:

- 한 plan directory가 왜 계속 실행 중인지 단일 상태로 조회하기 어렵다.
- pause/resume/clear를 구현하려면 phase 상태, lease 상태, handoff 상태를 같이 해석해야 한다.
- 오래된 worker/dispatcher가 새 목표를 덮는 stale update 방어가 goal_id 기준으로 정리돼 있지 않다.

권장:

- `.claude/runtime-state.sqlite`에 plan-directory goal runtime을 저장하고, `phase-status.yaml` 최상위에는 사람이 읽는 `goalRuntime` mirror만 둔다.
- 필드는 최소 `goalId`, `objective`, `status`, `tokenBudget`, `tokensUsed`, `timeUsedSeconds`, `continuationSuppressed`, `createdAt`, `updatedAt`, `currentRunLeaseId`.

### G2. continuation scheduler가 lifecycle event 모델이 아님

현재 루프는 `agent-loop.mjs`의 `while (true)`와 dispatcher child restart로 이어진다. plan-directory completion에는 강하지만, Codex `/goal`처럼 session idle, user input, mailbox priority 같은 event boundary는 없다.

영향:

- conversational runtime과 장수 process runtime의 책임 경계가 흐려질 수 있다.
- 사용자 입력이 들어온 시점에 목표를 pause/continue로 다루는 모델이 약하다.
- process exit/restart는 잘 다루지만, turn lifecycle 단위의 soft continuation 표현은 부족하다.

권장:

- 지금의 `delegated-terminal`은 유지한다.
- 그 위에 `GoalRuntimeEvent`에 해당하는 내부 이벤트명만 추가한다.
- 최소 이벤트: `GoalStarted`, `AttemptStarted`, `ToolOrArtifactChanged`, `AttemptFinished`, `BudgetLimited`, `Interrupted`, `Paused`, `Resumed`, `GoalCompleted`.

### G3. token/time budget이 watchdog으로 대체돼 있음

현재 하네스는 `AGENT_LOOP_WATCHDOG_MAX_SECONDS`, restart cap, verification freshness로 runaway를 막는다. 하지만 goal별 token/time accounting은 없다.

영향:

- 긴 작업의 비용 추적이 stop reason과 로그에 흩어진다.
- budget-limited 상태와 normal failure가 구분되지 않는다.
- 목표별 ROI나 재시도 비용 분석이 어렵다.

권장:

- 1차는 wall-clock 기반 `timeUsedSeconds`부터 넣는다.
- token은 Codex/Claude CLI usage를 안정적으로 읽을 수 있을 때만 정확 집계한다.
- 정확 token을 못 읽으면 `tokensUsed: null`, `accountingQuality: unavailable|estimated|exact`로 두고 거짓 수치를 만들지 않는다.

### G4. user control이 stop reason 수준에 머문다

현재 `HANDOFF.md`와 QA closeout reason에는 `blocked`, `interrupted`, `context_limit`, `user_pause`, `deferred_verification`이 있다. 하지만 사용자가 루프를 제어하는 command surface는 약하다.

영향:

- 운영 중인 phase run을 “일시정지/재개/목표 제거”로 다루기 어렵다.
- stop reason과 user intent가 같은 층에 섞인다.

권장:

- `node .claude/scripts/phase-goal-control.mjs status|pause|resume|clear <plan-dir>` 형태의 얇은 제어 스크립트를 추가한다.
- `pause`는 active worker를 즉시 죽이는 기능이 아니라, 다음 continuation 진입을 막는 상태 전이로 시작한다.

### G5. no-tool/no-artifact suppression이 암묵적임

현재는 completion gate 실패, `phase-did-not-advance`, missing evidence remediation으로 반복을 제어한다. `/goal`의 “continuation turn이 tool call을 안 했으면 반복 continuation 억제”와 같은 명시 상태는 없다.

영향:

- 말만 하고 artifact를 바꾸지 않는 worker 반복을 stop reason으로 설명하기 어렵다.
- restart cap에 도달한 뒤에야 반복 문제가 보일 수 있다.

권장:

- attempt 전후로 `QA_REPORT`, `SCORECARD`, verdict file, git diff fingerprint를 비교한다.
- meaningful artifact delta가 없고 exit code가 0이면 `continuationSuppressed=true` 또는 `lastOutcome=no_effect`로 기록한다.
- 다음 루프는 같은 prompt 재시도가 아니라 replan/remediation prompt로 전환한다.

### G6. completion audit은 강하지만 분산돼 있음

현재 completion gate는 `/goal`보다 더 강한 면도 있다. `SCORECARD`, `QA_REPORT`, `verify-plan-conformance`, `phase-closeout`, `workflow-enforcement`가 이미 evidence-first closeout을 강제한다.

남은 갭은 audit 품질이 아니라 audit ergonomics다.

권장:

- phase prompt에 이미 있는 checklist를 `prompt-to-artifact checklist` 이름으로 명시한다.
- `SCORECARD.md`의 `OBJ-*`와 `QA_REPORT.md`의 source plan conformance를 goal objective의 요구사항 매핑으로 더 직접 연결한다.

## 우선순위

### P1

1. `GoalEnvelope` 상태 모델 추가
   - 목표: plan-directory 단위 objective/status/accounting을 한 곳에서 조회
   - 대상: `agent-loop-phase-state.mjs` 또는 신규 `goal-runtime.mjs`
   - 완료 조건: stale `goalId` 업데이트가 거부되고, pause/resume/complete/budget_limited 상태가 저장됨

2. wall-clock budget accounting 추가
   - 목표: timeout/retry와 별개로 목표 사용 시간을 누적
   - 대상: `moonshot-phase-dispatch.mjs`, `agent-loop.mjs`, `agent-loop-phase-runner.mjs`
   - 완료 조건: summary와 debug log에 goal elapsed/budget 상태가 남음

3. user control script 추가
   - 목표: status/pause/resume/clear를 command surface로 제공
   - 대상: 신규 `phase-goal-control.mjs`
   - 완료 조건: paused 상태에서는 다음 continuation이 시작되지 않음

### P2

4. no-effect continuation suppression
   - 목표: artifact delta 없는 반복을 조기 억제
   - 대상: `agent-loop-phase-runner.mjs`, `agent-loop-phase-runtime.mjs`
   - 완료 조건: no-effect attempt가 restart cap까지 반복되지 않고 replan/remediation으로 전환됨

5. prompt-to-artifact checklist 명명
   - 목표: Codex `/goal` audit vocabulary와 현재 SCORECARD/QA를 정렬
   - 대상: `agent-loop-phase-plan-lib.mjs`, `SCORECARD.template.md`, `QA_REPORT.template.md`
   - 완료 조건: objective 요구사항마다 evidence path가 명시됨

6. budget-limited soft stop
   - 목표: failure와 budget exhaustion을 분리
   - 대상: `agent-loop-phase-runner.mjs`, `agent-loop-phase-runtime.mjs`
   - 완료 조건: budget 초과 시 새 실질 작업 대신 wrap-up/handoff가 생성됨

## 채택하지 않을 것

- 현재 phase runner를 Codex `/goal` 위에서 다시 돌리는 중첩 목표 모드.
  - 이유: 두 continuation runtime이 서로 stop/continue 판단을 하며 책임이 겹친다.
- OS daemon처럼 터미널 종료 후에도 계속 도는 구조로 확장.
  - 이유: `/goal`도 persisted state와 runtime continuation이지 daemon 보장은 아니다.
- token 수치를 추정값으로 꾸며 exact accounting처럼 표시.
  - 이유: 운영 판단을 오염시킨다.

## 권장 설계 스케치

```ts
type GoalStatus = "active" | "paused" | "budget_limited" | "complete";

type GoalEnvelope = {
  goalId: string;
  objective: string;
  status: GoalStatus;
  tokenBudget?: number;
  tokensUsed?: number | null;
  timeBudgetSeconds?: number;
  timeUsedSeconds: number;
  accountingQuality: "unavailable" | "estimated" | "exact";
  continuationSuppressed: boolean;
  currentRunLeaseId?: string;
  createdAt: string;
  updatedAt: string;
};
```

적용 원칙:

- SQLite는 runtime state, lease, pause/resume/clear, budget/accounting, event log의 truth source다.
- `phase-status.yaml`과 execution artifacts는 human/audit evidence의 truth source다.
- `GoalEnvelope`는 phase state를 대체하지 않고 plan-directory 실행 목표를 감싸는 envelope다.
- completion 판정은 계속 verifier/scorecard가 소유한다.
- 모델은 목표 완료를 “요청”할 수 있지만, 상태 전이는 dispatcher/verifier가 증거를 보고 확정한다.

## 최종 판단

Codex `/goal`에서 바로 가져올 가치는 “자동으로 계속함”이 아니다. 그건 현재 phase runner도 이미 한다.

진짜 가져올 가치는 다음 네 가지다.

1. 목표 상태를 phase/log/artifact 밖의 1급 runtime state로 둔다.
2. continuation을 evidence delta와 accounting에 묶는다.
3. budget exhaustion을 failure와 분리한다.
4. 사용자 제어를 stop reason이 아니라 state transition으로 모델링한다.

현재 하네스의 다음 개선은 새 runner를 만드는 일이 아니라, 기존 runner에 목표 상태 envelope를 추가하는 일이다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`
- `.claude/docs/guidelines/long-running-harness.md`
- `.claude/docs/guidelines/resumable-session-layer.md`
- `.claude/docs/guidelines/external-skill-pattern-transfer.md`
