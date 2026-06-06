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
  phaseStatusFile: ".moonshot-relay/docs/phase-status.yaml"
  sprintContractPath: "docs/implementation/execution/02-core-implementation/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/02-core-implementation/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/02-core-implementation/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/02-core-implementation/SCORECARD.md"
  executionRoot: "docs/implementation/execution"
  priorAttemptSummary: "E2E login flow failed after API refactor"
  projectKnowledgeContext:
    schemaVersion: 1
    status: "ready|degraded_read|degraded_write|not_configured|stale"
    strictness: "advisory|required"
    stage: "execute"
    promptBlock: "## Project Knowledge Context\n..."
```

## Workflow

### 1. 시도 범위 컨텍스트만 로드

아래만 읽습니다.
- active phase 문서
- `SPRINT_CONTRACT.md`
- `QA_REPORT.md`
- 있으면 `HANDOFF.md`
- `SCORECARD.md`

가장 먼저 `SPRINT_CONTRACT.md` 의 `Policy Anchors` 섹션을 확인합니다.
strict 또는 `meta_harness` 작업에서 policy anchors 나 필수 검증 명령이 비어 있으면, 코드 수정보다 먼저 sprint contract 를 보강하거나 blocker 로 반환해야 합니다.
`projectKnowledgeContext`는 typed summary-only Project Knowledge Context로만 읽습니다. 누락되어 있으면 `moonshot-orchestrator`를 실행하기 전에 `stage=execute` context를 advisory 또는 required strictness에 맞춰 생성합니다.

이전 coordinator 대화는 다시 로드하지 않습니다.
`.moonshot-relay/docs/ko/`는 MemoryGraph context로 읽지 않고, raw MemoryGraph record를 다음 단계로 넘기지 않습니다.

### 2. phase attempt 모드로 orchestrator 실행

현재 phase만 active slice로 보고 `moonshot-orchestrator`를 호출합니다.

필수 제약:
- `signals.phaseAttemptMode = true`
- `artifacts.activePhaseDocPath = {phaseDocPath}`
- 전달받은 execution artifact 경로 재사용
- 전달받은 `projectKnowledgeContext`를 재사용하고 `analysisContext.projectKnowledge.stageCoverage.execute` 같은 stage coverage bookkeeping만 갱신
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
    evidenceFresh: false
    contractApplicable: false
    mode: "fallback"       # contract | workspace | fallback
    requiredChecks:
      declared: []
      executed: []
      missing: []
    failedChecks:
      - "browserFlows.login"
  score:
    current: 70
    target: 100
    unmetChecklistItems: 2
    blockingDefects: 1
    verdict: "retry"       # done | retry | blocked
  handoffRequired: true
```

완료 정규화 규칙:
- 이번 시도의 verifier 결과가 contract 기반 required check에 대한 최신 증거를 포함할 때만 `status: completed` 를 반환합니다.
- 점수 verdict 가 `done` 이고 target score 를 충족하며 unmet checklist / blocking defect 가 0일 때만 `status: completed` 를 반환합니다.
- 검증이 없거나, 오래됐거나, indeterminate 이거나, 일부만 통과한 상태면 완료 표현 대신 `partial` 또는 `failed` 를 반환합니다.
- `status: completed` 는 이 단일 phase 시도가 외부 루프의 완료 판정 후보가 되었다는 뜻일 뿐이며, 전체 plan 완료나 세션 종료를 뜻하지 않습니다.

## 상태 전이 표

| Attempt status | 최소 verifier 조건 | 의미 |
|---|---|---|
| `completed` | `verdict=passed` 이고 `evidenceFresh=true` 이고 `requiredChecks.missing=[]` | phase 완료 후보 |
| `partial` | 구현/검증 진전은 있지만 완료 조건이 아직 미충족 | 재시도 또는 후속 조치 필요 |
| `failed` | 검증 실패, 스코프 차단, 또는 재시도 중단 필요 | 다음 phase로 진행 금지 |
| `blocked` | 입력/계약 부족 등 로컬 분류로 사용 가능; 반환 시에는 `failed`로 정규화 | 계약/범위 보강 후 재시도 |

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
- 최신 검증 증거가 없으면 완료된 시도로 요약하면 안 됩니다.
- final 응답, closeout 문구, 세션 종료처럼 들리는 표현을 쓰면 안 됩니다. 완료 여부의 최종 판정과 다음 phase 진입 결정은 coordinator가 담당합니다.
- downstream 상태 전이에 필요한 최소 verifier 메타데이터(`verdict`, `evidenceFresh`, `requiredChecks.missing`)는 반드시 포함해야 합니다.
- 판정 출처를 위한 `contractApplicable`, `mode` 도 함께 포함해야 합니다.

## References

- `skills/moonshot-orchestrator/SKILL.md`
- `skills/moonshot-in-session-coordinator/SKILL.md`

## Project Knowledge Context Contract

`projectKnowledgeContext` is the authoritative prompt-facing contract. It is summary-only and consists of `## Project Knowledge Context`, typed status metadata, policy anchors, semantic facts, graph synopsis, ontology constraints, stale/unavailable entries, and omission categories.

Rules:
- Consume or return only compact summary items and status metadata.
- Treat old `projectMemoryContext` wording as legacy and non-authoritative.
- Never return raw MemoryGraph records, KG edges, ontology dumps, logs, transcripts, or secret-like strings.
- Advisory unavailable state is a degraded warning; strict memory tasks must mark blocking metadata before execution proceeds.
