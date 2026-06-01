---
name: moonshot-phase-executor
description: 준비된 phase 작업을 in-session coordinator로 라우팅하고, delegated-terminal은 legacy compatibility로만 유지하는 skill-level 실행 어댑터.
surfaceStatus: internal_stage_owner
triggers:
  - "phase executor"
  - "phase execution adapter"
---

# Moonshot Phase Executor

## 역할

`moonshot-phase-runner` 다음에 오는 skill-first 실행 경계입니다.
사용자는 command adapter를 직접 실행할 필요가 없어야 합니다. 이 스킬은 `phaseRunnerResult`를 받아 다음으로 라우팅합니다.
- 기본 active 실행 경로는 `/moonshot-in-session-coordinator`
- `moonshot-phase-dispatch.mjs` / `agent-loop.mjs`는 명시적인 legacy/headless compatibility 유지보수에만 사용

이 스킬은 기본 공개 진입점이 아니라 내부 execution handoff입니다.
사용자는 보통 이 스킬이 아니라 `moonshot-phase-runner`에서 시작해야 합니다.

## Legacy Adapter Policy

`delegated-terminal`, `moonshot-phase-dispatch.mjs`, `agent-loop.mjs`, shell wrapper는 legacy adapter입니다. active runtime workflow payload의 기본 실행 경로가 아니며 자동 선택하면 안 됩니다. 다음 조건을 모두 만족할 때만 사용합니다.
- 사용자 또는 maintainer가 legacy adapter path 검증/수리를 명시적으로 요청함
- local checkout에 legacy script가 존재함
- `legacyAdapterReason`을 기록함
- 결과를 기본 phase-runner 계약이 아니라 compatibility evidence로 취급함

## 입력

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "in-session-coordinator" # delegated-terminal은 legacy only
  planDir: "docs/implementation/"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  worksetTemplate: "<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md"
  executionRuntime: "auto"            # auto | claude | codex
  prepareOnly: false
  autoStartExecution: true
  legacyAdapterReason: ""             # executionMode == delegated-terminal이면 필수
```

## Workflow

### 1. prepare-only 존중

`prepareOnly == true`이면:
- 아무 실행도 하지 않습니다.
- 준비 완료 상태와 선택적 adapter command만 노출합니다.

### 2. execution mode별 라우팅

라우팅 전에 `phaseRunnerResult.projectKnowledgeContext`가 있는지 확인합니다. 없으면 현재 프로젝트 루트에서 `knowledge-context-build.mjs --stage execute --json`을 실행하고 `projectKnowledgeContext.promptBlock`과 status-only metadata만 실행 경로에 전달합니다.

`executionMode == in-session-coordinator`이면:
- `/moonshot-in-session-coordinator`를 호출합니다.
- `phaseRunnerResult`를 그대로 전달합니다.
- 현재 런타임이 fresh attempt를 안정적으로 계속 생성하지 못하면, 조용히 `delegated-terminal`로 폴백하지 말고 구체적인 blocker를 기록하거나 runtime 변경을 요청합니다.
- active slice가 있으면 `<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md`로 `WORKSET.md` 초기화를 보장합니다.
- active plan directory에 다음 actionable phase가 남아 있으면 completed phase 뒤에서 멈추지 않습니다.
- review pending 또는 finish pending 상태의 slice를 완료로 취급하지 말고, 실제 review와 closeout artifact가 맞춰질 때까지 다음 attempt를 강제합니다.

`executionMode == delegated-terminal`이면:
- 비어 있지 않은 `legacyAdapterReason`이 필요합니다.
- local checkout에 `moonshot-phase-dispatch.mjs` / `agent-loop.mjs`가 있는지 확인합니다.
- legacy compatibility check 또는 명시적 maintainer repair path로만 실행합니다.
- 결과를 기본 phase-runner execution contract로 표현하지 않습니다.

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
- 실행 dispatch 전에 `.claude/docs/guidelines/memorygraph-workflow.ko.md`를 적용합니다.
- coordinator 입력에는 raw MemoryGraph/KG/ontology record가 아니라 요약된 `projectKnowledgeContext`만 넘깁니다. legacy dispatcher/agent-loop를 명시적으로 사용할 때도 같은 summary-only 규칙을 적용합니다.
- 기본 `modelEffortProfile`은 `standard`입니다. `deep`과 `max`는 QA와 workflow evidence에 구체적인 `Effort escalation reason`이 있어야 합니다.
- 사용자에게 모델 선택을 요구하지 않습니다. provider-neutral model router가 stage별 runtime model/effort를 선택하고 선택된 provider/model/effort를 execution evidence에 기록합니다.
- legacy script는 compatibility adapter일 뿐이며 명시적 maintainer intent 뒤에 숨어야 합니다.
- `moonshot-phase-runner`는 기본적으로 `prepareOnly != true`일 때 이 스킬을 자동 시작해야 합니다.
- 기본 경로에서 사용자에게 `moonshot-phase-dispatch.mjs` 수동 실행을 요구하지 않습니다.
- active path에서 `delegated-terminal`을 자동 fallback으로 선택하지 않습니다.
- `review pending`, `workflow-review-bundle-missing`, `finish-closeout-incomplete`, placeholder closeout artifact는 완료 상태가 아닙니다.
- 유효한 성공 반환 경계는 plan-directory 완료입니다. 즉 actionable phase가 모두 완료되었거나, 명시적인 loop stop 조건이 기록되어야 합니다.

## References

- `/moonshot-phase-runner`
- `/moonshot-in-session-coordinator`
- `archive/scripts/legacy-phase-adapters/agent-loop.mjs`는 legacy compatibility adapter
- `archive/scripts/legacy-phase-adapters/moonshot-phase-dispatch.mjs`는 legacy compatibility adapter
- `archive/scripts/legacy-phase-adapters/agent-loop.sh` / `archive/scripts/legacy-phase-adapters/moonshot-phase-dispatch.sh`는 legacy wrapper
- `<MOONSHOT_RELAY_HOME>/templates/execution/WORKSET.template.md`

## Project Knowledge Context Contract

in-session coordinator 또는 forked-agent 실행으로 라우팅하기 전에 `phaseRunnerResult.projectKnowledgeContext`가 있는지 확인합니다. 없으면 `knowledge-context-build.mjs --stage execute --json`을 실행하고 `projectKnowledgeContext.promptBlock`과 status-only metadata만 전달합니다.

이 executor는 context builder를 우회하면 안 됩니다. coordinator와 attempt manifest에는 knowledge status metadata만 기록할 수 있으며 raw MemoryGraph/KG/ontology/log/transcript payload는 기록하지 않습니다. legacy dispatcher/agent-loop 실행도 명시적으로 사용할 때 같은 summary-only knowledge 규칙을 따라야 합니다.
