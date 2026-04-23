---
name: moonshot-phase-executor
description: 준비된 phase 작업을 delegated-terminal 또는 in-session coordinator로 라우팅하는 skill-level 실행 어댑터.
triggers:
  - "phase executor"
  - "phase execution adapter"
---

# Moonshot Phase Executor

## 역할

`moonshot-phase-runner` 다음에 오는 skill-first 실행 경계입니다.
사용자는 command adapter를 직접 실행할 필요가 없어야 합니다. 이 스킬은 `phaseRunnerResult`를 받아 다음으로 라우팅합니다.
- `delegated-terminal`이면 내부 adapter 경로로 `moonshot-phase-dispatch.mjs` / `agent-loop.mjs`
- `in-session-coordinator`이면 `/moonshot-in-session-coordinator`

이 스킬은 기본 공개 진입점이 아니라 내부 execution handoff입니다.
사용자는 보통 이 스킬이 아니라 `moonshot-phase-runner`에서 시작해야 합니다.

## 입력

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "delegated-terminal" # 또는 in-session-coordinator
  planDir: "docs/implementation/"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  worksetTemplate: ".claude/templates/execution/WORKSET.template.md"
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  executionCommand: "node .claude/scripts/moonshot-phase-dispatch.mjs ..."
  executionAdapterCommand: "node .claude/scripts/agent-loop.mjs ..."
```

## Workflow

### 1. prepare-only 존중

`prepareOnly == true`이면:
- 아무 실행도 하지 않습니다.
- 준비 완료 상태와 선택적 adapter command만 노출합니다.

### 2. execution mode별 라우팅

`executionMode == delegated-terminal`이면:
- `phaseRunnerResult.executionCommand`를 현재 세션에서 즉시 실행합니다.
- runtime 선택값(`auto|claude|codex`)을 그대로 전달합니다.
- 이 호출은 skill 경계 뒤에 숨깁니다.
- delegated-terminal 프로세스가 종료될 때까지 붙어 있습니다.
- 단일 구현 라운드, partial 체크포인트, conversational 요약으로 실제 loop를 대체하면 안 됩니다.
- phase가 `in_progress` + `lastOutcome=partial` 또는 `score.verdict=retry` 상태로 남아 있으면 조기 반환하지 말고 delegated-terminal 경로를 계속 유지합니다.
- 어떤 phase가 `completed`가 되었더라도 active plan directory에 actionable phase가 남아 있으면 같은 delegated-terminal 경계를 유지하고 계속 진행합니다.
- completion gate가 review evidence 누락이나 finish-closeout 미완료를 보고하면 성공으로 반환하지 말고, 빠진 단계를 보완할 때까지 loop를 계속 유지합니다.

`executionMode == in-session-coordinator`이면:
- `/moonshot-in-session-coordinator`를 호출합니다.
- `phaseRunnerResult`를 그대로 전달합니다.
- 현재 런타임이 fresh attempt를 안정적으로 계속 생성하지 못하면, 완전 자율 실행인 척하지 말고 런타임 측에서 `delegated-terminal`로 폴백하는 편이 안전합니다.
- active slice가 있으면 `.claude/templates/execution/WORKSET.template.md`로 `WORKSET.md` 초기화를 보장합니다.
- active plan directory에 다음 actionable phase가 남아 있으면 completed phase 뒤에서 멈추지 않습니다.
- review pending 또는 finish pending 상태의 slice를 완료로 취급하지 말고, 실제 review와 closeout artifact가 맞춰질 때까지 다음 attempt를 강제합니다.

### 3. runtime 처리

- `executionRuntime == auto`
  - 가능하면 Codex 우선
  - 없으면 Claude 사용
- `executionRuntime == claude`
  - Claude 경로 실행
- `executionRuntime == codex`
  - Codex 경로 실행

### 4. 결과 처리

요약된 실행 상태만 반환합니다.

```yaml
phaseExecutionResult:
  started: true
  mode: "in-session-coordinator"
  runtime: "codex"
  status: "running"   # running | completed | failed | prepared_only
  nextBoundary: "moonshot-in-session-coordinator"
```

## 계약

- 이 스킬은 `moonshot-phase-runner` 뒤에 숨는 내부 phase 실행 handoff입니다.
- 스크립트는 구현용 내부 adapter일 뿐이며 이 스킬 뒤에 숨어야 합니다.
- `moonshot-phase-runner`는 기본적으로 `prepareOnly != true`일 때 이 스킬을 자동 시작해야 합니다.
- 기본 경로에서 사용자에게 `moonshot-phase-dispatch.mjs` 수동 실행을 요구하지 않습니다.
- `delegated-terminal`의 유효한 실행 경계는 실제 dispatcher/agent-loop 프로세스입니다. 한 번의 요약 round는 대체물이 아닙니다.
- `partial`, `retry`, QA artifact 갱신, resumable handoff만으로는 delegated-terminal 중단 사유가 되지 않습니다.
- `review pending`, `workflow-review-bundle-missing`, `finish-closeout-incomplete`, placeholder closeout artifact는 완료 상태가 아닙니다.
- 유효한 성공 반환 경계는 plan-directory 완료입니다. 즉 actionable phase가 모두 완료되었거나, 명시적인 loop stop 조건이 기록되어야 합니다.
- dispatcher lease가 active인 동안의 진행 보고는 commentary 형태여야 하며, mid-run checkpoint에서 `final` 응답이나 세션 종료처럼 들리는 표현을 내보내면 안 됩니다.
- auto-start 실행에서는 성공 반환 직전에 `node .claude/scripts/phase-run-lease.mjs assert-return-allowed <status-file> <runLeaseId> true false`가 허용되어야 합니다. 거부되면 요약을 반환하지 말고 loop를 계속 유지하거나 계약 위반으로 실패시켜야 합니다.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/agent-loop.sh` / `.claude/scripts/moonshot-phase-dispatch.sh`는 compatibility wrapper
- `.claude/templates/execution/WORKSET.template.md`
