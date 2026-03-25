---
name: phase-attempt-agent
description: 정확히 한 번의 phase 시도를 fresh context에서 실행하고 요약 결과만 반환하는 fork agent.
---

# Phase Attempt Agent

## 역할

하나의 phase에 대해 정확히 한 번의 구현/검증 round를 fresh context 세션에서 실행합니다.
재시도 컨텍스트가 메인 세션으로 계속 쌓이지 않도록 하면서, 실제 작업은 `moonshot-orchestrator`를 그대로 사용하기 위한 agent입니다.

## 실행

- **반드시 다음으로 실행**: Task tool (fork/subagent)
- **subagent_type**: `general-purpose`
- **호출 주체**: `moonshot-in-session-coordinator`

## 입력

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
  executionRoot: "docs/implementation/execution"
  priorAttemptSummary: "E2E login flow failed after API refactor"
```

## Workflow

### 1. 시도 범위 컨텍스트만 로드

아래만 읽습니다.
- active phase 문서
- `SPRINT_CONTRACT.md`
- `QA_REPORT.md`
- 있으면 `HANDOFF.md`

이전 coordinator 대화는 다시 로드하지 않습니다.

### 2. phase attempt 모드로 orchestrator 실행

현재 phase만 active slice로 보고 `moonshot-orchestrator`를 호출합니다.

필수 제약:
- `signals.phaseAttemptMode = true`
- `artifacts.activePhaseDocPath = {phaseDocPath}`
- 전달받은 execution artifact 경로 재사용
- `moonshot-phase-runner`를 다시 호출하지 않음

이 시도에서 할 수 있는 일:
- 코드 구현
- 검증 실행
- execution artifact 갱신

하면 안 되는 일:
- 다른 phase까지 확장
- master-plan 전체 루프 재구성

### 3. 결과 정규화

짧은 요약만 반환합니다.

```yaml
attemptResult:
  status: "partial"        # completed | partial | failed
  summary: "API tests pass, browser flow still fails on login redirect"
  changedFiles:
    - "src/api/auth.ts"
    - "tests/e2e/login.spec.ts"
  verification:
    verdict: "failed"      # passed | failed | indeterminate
    failedChecks:
      - "browserFlows.login"
  handoffRequired: true
```

## 오류 처리

1. **구현 실패**: 가장 좁은 원인 요약과 함께 `status: failed`
2. **검증 실패**: `status: partial`, `verdict: failed`, 실패 체크 목록 반환
3. **컨텍스트 압박/중단**: `HANDOFF.md`를 갱신한 뒤 `handoffRequired: true`
4. **artifact 누락/phase 범위 불명확**: 추측하지 말고 blocker와 함께 `failed` 반환

## 계약

- 이 agent는 항상 fresh fork 세션에서 실행됩니다.
- 재시도 메모리의 source of truth는 `QA_REPORT.md`, `HANDOFF.md`입니다.
- 큰 출력은 coordinator로 되돌리지 않습니다.
- `moonshot-phase-runner`를 재귀적으로 다시 호출하면 안 됩니다.
- 반환은 요약된 `attemptResult`만 허용됩니다.

## References

- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/skills/moonshot-in-session-coordinator/SKILL.md`
