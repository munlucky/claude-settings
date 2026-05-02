# Harness Engineering Implementation Backlog

Last-Reviewed: 2026-03-30

## 목적

이 문서는 `harness-engineering-foundation` 문서군에서 제안된 개선 항목을 실제 실행 단위로 추적하기 위한 backlog다.

## 상태 요약

| ID | 제목 | 상태 | 우선순위 |
|---|---|---|---|
| `HAP-001` | 패턴 인식형 팀 아키텍처 선택기 | `done` | P1 |
| `HAP-002` | 전략 게이트 분리 | `done` | P1 |
| `HAP-003` | solution memory 도입 | `done` | P1 |
| `HAP-004` | 스킬 3계층 taxonomy 규약화 | `done` | P2 |
| `HAP-005` | phase/slice handoff manifest 도입 | `done` | P2 |
| `HAP-006` | 하네스 관측 계층 추가 | `done` | P3 |
| `CGOAL-001` | GoalEnvelope 상태 모델 도입 | `in_progress` | P1 |
| `CGOAL-002` | goal time/budget accounting 추가 | `in_progress` | P1 |
| `CGOAL-003` | phase goal user control surface 추가 | `in_progress` | P1 |
| `CGOAL-004` | no-effect continuation suppression 추가 | `proposed` | P2 |

## Backlog Items

### `HAP-001` 패턴 인식형 팀 아키텍처 선택기

- 상태: `done`
- rationale:
  현재는 팀 프리셋은 있으나, 패턴 기반 선택 레이어가 약하다.
- target files:
  - `.claude/templates/agent-teams-config.yaml`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-teams-runner/SKILL.md`
- dependencies:
  - 없음
- acceptance criteria:
  - 팀 정의에 `pattern` 메타데이터가 존재한다.
  - 오케스트레이터가 패턴을 먼저 선택하고 팀을 나중에 결정한다.
  - 선택 이유가 workflow evidence 또는 notes에 남는다.
  - 현재 상태:
    - `agent-teams-config.yaml`에 패턴/입출력 계약 메타를 추가했다.
    - `moonshot-orchestrator`와 `moonshot-teams-runner`에 패턴 우선 선택 규칙을 반영했다.
    - `selectedPattern`, `selectedTeam`, `selectionReason` 기록 규약을 추가했다.

### `HAP-002` 전략 게이트 분리

- 상태: `done`
- rationale:
  실행 readiness와 별도로 제품 가치/범위, 아키텍처 완결성을 판단하는 레이어가 필요하다.
- target files:
  - 신규 전략 리뷰 스킬 2종
  - `.claude/skills/product-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-plan-writer/SKILL.md`
- dependencies:
  - 없음
- acceptance criteria:
  - 제품/범위 리뷰와 아키텍처 리뷰가 독립 skill로 존재한다.
  - 각 단계 verdict가 `pass|conditional_pass|scope_reduction|hold_scope|fail` 중 하나로 남는다.
  - planning 단계에서 두 리뷰가 명시적으로 연결된다.
  - 현재 상태:
    - `plan-ceo-review`, `plan-eng-review` 스킬을 추가했다.
    - `product-orchestrator`와 `moonshot-plan-writer`에 연결 규칙을 반영했다.

### `HAP-003` solution memory 도입

- 상태: `done`
- rationale:
  `QA_REPORT`와 `HANDOFF`의 학습이 재사용 가능한 자산으로 승격돼야 한다.
- target files:
  - `.claude/docs/solutions/`
  - `.claude/skills/session-logger/SKILL.md`
  - 관련 가이드 문서
- dependencies:
  - 없음
- acceptance criteria:
  - solution asset 저장 경로와 메타데이터 포맷이 정의된다.
  - 승격 조건이 문서화된다.
  - 최소 1개 이상의 예시 asset이 존재한다.
  - 현재 상태:
    - `.claude/docs/solutions/README.md`와 템플릿, 예시 asset을 추가했다.
    - `session-logger`에 승격 규칙을 반영했다.

### `HAP-004` 스킬 3계층 taxonomy 규약화

- 상태: `done`
- rationale:
  스킬 수가 늘어날수록 layer와 로딩 규약이 필요하다.
- target files:
  - `.claude/docs/guidelines/skill-composition.md`
  - `SKILL.md` frontmatter conventions
- dependencies:
  - `HAP-001`
- acceptance criteria:
  - `orchestrator`, `agent_extending`, `external_interface` 구분이 문서화된다.
  - 신규 스킬 메타 필드 규약이 정의된다.
  - 최소 핵심 스킬 몇 개가 새 taxonomy 예시를 따른다.
  - 현재 상태:
    - `skill-composition` 가이드에 layer taxonomy를 추가했다.
    - `moonshot-orchestrator`, `product-orchestrator`, `session-logger`, 신규 전략 리뷰 스킬에 메타 필드를 반영했다.

### `HAP-005` phase/slice handoff manifest 도입

- 상태: `done`
- rationale:
  큰 artifact 사이를 잇는 round-level workset 전달 규약이 필요하다.
- target files:
  - `.claude/templates/execution/`
  - `.claude/skills/moonshot-phase-executor/SKILL.md`
  - `.claude/skills/moonshot-in-session-coordinator/SKILL.md`
- dependencies:
  - 없음
- acceptance criteria:
  - `WORKSET.md` 또는 `handoff.json` 템플릿이 존재한다.
  - 필수 필드가 문서화된다.
  - 새 round 시작 시 갱신 주체가 명시된다.
  - 현재 상태:
    - `WORKSET.template.md`를 추가했다.
    - `moonshot-phase-executor`와 `moonshot-in-session-coordinator`에 `WORKSET.md` 사용 규칙을 반영했다.

### `HAP-006` 하네스 관측 계층 추가

- 상태: `done`
- rationale:
  어떤 패턴과 팀 구조가 품질을 올리는지 측정할 데이터가 부족하다.
- target files:
  - `.claude/verification.contract.yaml`
  - `.claude/skills/efficiency-tracker/SKILL.md`
  - verdict JSON 또는 workflow evidence 생성 지점
- dependencies:
  - `HAP-001`
- acceptance criteria:
  - 최소 metric schema가 정의된다.
  - `selected pattern`, `selected team`, `retry count` 등이 기록된다.
  - 패턴별 결과를 집계할 수 있는 경로가 생긴다.
  - 현재 상태:
    - `verification.contract.yaml`에 `teamMetrics` artifact와 observability schema를 추가했다.
    - `team-observability` 가이드와 `efficiency-tracker` 출력 규약을 추가했다.

### `CGOAL-001` GoalEnvelope 상태 모델 도입

- 상태: `in_progress`
- rationale:
  Codex CLI `/goal`은 objective/status/accounting을 thread goal state로 persisted한다. 현재 phase runner는 목표 상태가 `phase-status.yaml`, lease, QA, handoff에 분산돼 있어 pause/resume/budget/complete를 하나의 runtime entity로 조회하기 어렵다.
- target files:
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
- dependencies:
  - 없음
- acceptance criteria:
  - plan-directory 단위 `goalId`, `objective`, `status`, `timeUsedSeconds`, `tokenBudget`, `tokensUsed`, `continuationSuppressed`가 SQLite에 저장된다.
  - stale `goalId` 업데이트가 새 목표를 덮어쓰지 못한다.
  - 기존 phase completion gate는 GoalEnvelope가 아니라 verifier/scorecard를 계속 source of truth로 사용한다.
  - 현재 상태:
    - `.claude/scripts/runtime-state.mjs`가 `.claude/runtime-state.sqlite`에 goal/phase/lease/event/accounting 테이블을 생성한다.
    - `phase-status.yaml`에는 사람이 볼 수 있는 `goalRuntime` mirror만 기록한다.
    - completion evidence는 계속 `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, verifier report가 소유한다.

### `CGOAL-002` goal time/budget accounting 추가

- 상태: `in_progress`
- rationale:
  현재 watchdog/restart cap은 runaway 방지에는 충분하지만 goal 단위 비용/시간 accounting은 아니다. budget exhaustion과 failure를 구분해야 장기 실행의 운영 판단이 깨끗해진다.
- target files:
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/agent-loop.mjs`
- dependencies:
  - `CGOAL-001`
- acceptance criteria:
  - wall-clock 사용량이 goal state에 누적된다.
  - token usage를 읽을 수 없을 때는 `accountingQuality: unavailable`로 기록하고 추정치를 exact처럼 표시하지 않는다.
  - budget 초과 시 새 실질 작업 대신 wrap-up/handoff 경로로 전환된다.
  - 현재 상태:
    - dispatch에서 `--goal-time-budget-seconds`, `--goal-token-budget` 또는 대응 환경변수를 SQLite goal runtime에 넘긴다.
    - token usage는 아직 exact source가 없으므로 `accountingQuality: unavailable`을 유지한다.
    - `budget_limited` 상태는 `agent-loop.mjs`가 다음 attempt 시작 전에 controlled stop으로 처리한다.

### `CGOAL-003` phase goal user control surface 추가

- 상태: `in_progress`
- rationale:
  현재 `user_pause`는 handoff/closeout reason으로 존재하지만, 실행 중 목표를 제어하는 command surface는 없다. pause/resume/clear를 상태 전이로 제공해야 운영자가 loop를 안전하게 제어할 수 있다.
- target files:
  - `.claude/scripts/phase-goal-control.mjs`
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/agent-loop.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/skills/moonshot-phase-runner/SKILL.md`
- dependencies:
  - `CGOAL-001`
- acceptance criteria:
  - `status|pause|resume|clear` 명령이 plan directory 기준으로 동작한다.
  - paused 상태에서는 다음 continuation/attempt가 시작되지 않는다.
  - clear는 runtime state만 제거하고 phase artifacts를 삭제하지 않는다.
  - 현재 상태:
    - `phase-goal-control.mjs`가 status/pause/resume/clear CLI를 제공한다.
    - `agent-loop.mjs`가 `paused`, `budget_limited`, `continuationSuppressed`를 다음 phase attempt 전에 확인한다.
    - `clear`는 SQLite runtime row만 제거하고 phase docs/artifacts는 건드리지 않는다.

### `CGOAL-004` no-effect continuation suppression 추가

- 상태: `proposed`
- rationale:
  Codex `/goal`은 tool call 없는 continuation 반복을 억제한다. 현재 phase runner는 artifact/verification gate 실패로 간접 방어하지만, artifact delta 없는 반복을 명시 상태로 분리하지 않는다.
- target files:
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`
- dependencies:
  - `CGOAL-001`
- acceptance criteria:
  - attempt 전후의 QA/SCORECARD/verdict/git-diff fingerprint를 비교한다.
  - exit code 0이지만 meaningful artifact delta가 없으면 `lastOutcome=no_effect` 또는 `continuationSuppressed=true`로 기록한다.
  - 같은 prompt 재시도 대신 replan/remediation prompt로 전환한다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/README.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- `docs/claude-tasks/harness-engineering-foundation/codex-goal-gap-analysis.md`
