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
- `delegated-terminal`이면 내부 adapter로 `agent-loop.sh`
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
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  executionCommand: ".claude/scripts/moonshot-phase-dispatch.sh ..."
  executionAdapterCommand: "bash .claude/scripts/agent-loop.sh ..."
```

## Workflow

### 1. prepare-only 존중

`prepareOnly == true`이면:
- 아무 실행도 하지 않습니다.
- 준비 완료 상태와 선택적 adapter command만 노출합니다.

### 2. execution mode별 라우팅

`executionMode == delegated-terminal`이면:
- 내부 adapter인 `agent-loop.sh`를 호출합니다.
- runtime 선택값(`auto|claude|codex`)을 그대로 전달합니다.
- 이 호출은 skill 경계 뒤에 숨깁니다.

`executionMode == in-session-coordinator`이면:
- `/moonshot-in-session-coordinator`를 호출합니다.
- `phaseRunnerResult`를 그대로 전달합니다.

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
- 기본 경로에서 사용자에게 `moonshot-phase-dispatch.sh` 수동 실행을 요구하지 않습니다.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `.claude/scripts/agent-loop.sh`
- `.claude/scripts/moonshot-phase-dispatch.sh`
