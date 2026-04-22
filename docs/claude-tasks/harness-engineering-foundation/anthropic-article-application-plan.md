# Anthropic Harness Article Application Plan

Last-Reviewed: 2026-04-22

## 역할

- targeted application plan

이 문서는 Anthropic의 2026-03-24 글 `Harness design for long-running application development`를 현재 `claude-settings` 저장소에 다시 대입해, 이미 흡수된 요소를 제외하고 남은 적용 항목만 추린 실행 계획이다.

canonical foundation은 `harness-engineering-foundation.md`, 현재 구조 평가는 `gap-analysis.md`, 기존 proposal/backlog는 `harness-application-ideas.md`, `implementation-backlog.md`를 따른다.

## 한 줄 판단

현재 저장소는 planner/generator/evaluator 분리, `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `WORKSET.md`, score-based closeout까지 이미 갖추고 있다.

따라서 이 글에서 지금 추가 가치가 큰 부분은 `새 구조 발명`이 아니라 아래 다섯 가지 운영 강화다.

- evaluator calibration
- contract negotiation hardening
- adaptive harness selection
- runtime-first QA depth
- retry/pivot stop rules

## 이미 반영된 항목

다음 항목은 현재 저장소에 이미 강하게 반영되어 있으므로 이번 계획의 우선 대상에서 제외한다.

- planner / generator / evaluator 역할 분리
- `SPRINT_CONTRACT.md -> QA_REPORT.md -> HANDOFF.md` 브리지 아티팩트
- strict verification contract와 separate evaluator mode
- `WORKSET.md` 기반의 phase/slice handoff
- team metrics 기반의 기본 observability
- planner 필요성, evaluator 필요성을 task 문맥에 따라 판단해야 한다는 운영 원칙

## 이번에 선택한 적용 항목

### `AAP-001` Evaluator Calibration Pack

- priority: `P1`
- why:
  현재 저장소는 evaluator 분리는 잘 되어 있지만, Anthropic 글에서 핵심이었던 "평가자를 별도로 두고도 추가로 skeptical 하게 튜닝한다"는 부분은 약하다.
- scope:
  - `.claude/docs/guidelines/verification-contract.md`
  - `.claude/docs/guidelines/verification-contract.ko.md`
  - `.claude/skills/completion-verifier/SKILL.md`
  - `.claude/skills/browser-verifier/SKILL.md`
  - `.claude/skills/codex-review-code/SKILL.md`
  - 신규 예시 또는 fixture 경로
- change:
  - evaluator용 공통 grading rubric을 명시한다.
  - `pass`, `retry`, `fail`, `indeterminate` 예시를 3-5개 정도의 gold example로 고정한다.
  - "looks strong" 같은 총평보다 먼저 defect-first 판정 규칙을 넣는다.
  - stub-only feature, route shadowing, dead interaction, fake success UI를 공통 실패 분류로 추가한다.
- acceptance:
  - verifier/QA 문서가 공통 실패 taxonomy를 사용한다.
  - evaluator prompt 또는 workflow가 "칭찬 먼저"가 아니라 "실패 탐지 먼저" 순서를 따른다.
  - 유사 결함에 대한 verdict 편차가 줄었다는 정성 메모 또는 예시가 생긴다.

### `AAP-002` Contract Negotiation Gate

- priority: `P1`
- why:
  현재 저장소는 `SPRINT_CONTRACT.md` 자체는 강하지만, Anthropic식으로 generator와 evaluator가 구현 전에 done criteria를 조율하는 절차를 더 명시적으로 강제할 여지가 있다.
- scope:
  - `.claude/templates/execution/`
  - `.claude/docs/guidelines/long-running-harness.md`
  - `.claude/docs/guidelines/long-running-harness.ko.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-phase-executor/SKILL.md`
- change:
  - medium/complex 작업에서 구현 시작 전 `contract reviewed by evaluator` 체크를 요구한다.
  - `SPRINT_CONTRACT.md`에 `non-goals`, `verification owner`, `runtime evidence plan`, `round fail conditions` 필드를 기본화한다.
  - evaluator가 계약에 이의가 있으면 구현 단계로 바로 내려가지 않고 계약 수정을 먼저 요구하도록 한다.
- acceptance:
  - medium/complex 흐름에서 계약 리뷰 없는 구현 시작이 비표준 경로로 명시된다.
  - 새 템플릿에 done definition과 fail condition이 분리되어 있다.
  - `QA_REPORT.md`가 계약 항목과 일대일로 연결된다.

### `AAP-003` Adaptive Harness Selection Matrix

- priority: `P1`
- why:
  Anthropic 글의 중요한 교훈은 하네스 복잡도를 고정하지 말라는 것이다. 현재 저장소에도 load-bearing 판단 질문은 있지만, planner/sprint/evaluator를 언제 줄일지에 대한 운영 매트릭스는 더 명시될 수 있다.
- scope:
  - `.claude/docs/guidelines/long-running-harness.md`
  - `.claude/docs/guidelines/long-running-harness.ko.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/verification.contract.yaml`
  - 필요 시 analysis context schema
- change:
  - task size, user-visible risk, runtime depth, model class를 기준으로 planner/sprint/evaluator 필요 여부를 표로 정리한다.
  - 선택된 하네스 부품과 생략 이유를 evidence에 남긴다.
  - "항상 evaluator", "항상 sprint" 같은 상시 복잡도 기본값을 약화한다.
- acceptance:
  - workflow evidence 또는 metrics에 `selectedHarnessComponents`와 `selectionReason`이 남는다.
  - simple/local 작업은 더 가볍게, long-running/UI-heavy 작업은 더 엄격하게 라우팅된다는 문서 규약이 생긴다.

### `AAP-004` Runtime-First QA Depth Upgrade

- priority: `P2`
- why:
  현재 계약은 runtime evidence를 요구하지만, Anthropic 사례처럼 evaluator가 실제 사용 흐름을 깊게 파고드는 수준까지 최소 깊이를 정의하면 QA 품질이 더 안정된다.
- scope:
  - `.claude/docs/guidelines/verification-contract.md`
  - `.claude/docs/guidelines/verification-contract.ko.md`
  - `.claude/skills/browser-verifier/SKILL.md`
  - `.claude/skills/qa-flow/SKILL.md`
  - `.claude/templates/execution/`
- change:
  - critical flow마다 `open -> act -> mutate -> persist -> recover` 식의 최소 상호작용 깊이를 정의한다.
  - evaluator가 "버튼 클릭됨"이 아니라 상태 변화와 재진입 성공까지 보게 한다.
  - stub 탐지용 질문 세트를 추가한다.
- acceptance:
  - `QA_REPORT.md`에 상호작용 단계와 상태 변화 증거가 남는다.
  - browser/runtime verifier가 단순 smoke에서 끝나는 경우를 warn으로 분류한다.

### `AAP-005` Retry / Pivot / Stop Policy

- priority: `P2`
- why:
  Anthropic 글은 평가 피드백을 받아 같은 방향을 다듬을지, 전환할지, 멈출지를 명시적으로 결정했다. 현재 저장소의 retry loop는 강하지만, remediation 전략 선택 규칙은 더 구체화할 수 있다.
- scope:
  - `.claude/docs/guidelines/long-running-harness.md`
  - `.claude/docs/guidelines/long-running-harness.ko.md`
  - `.claude/templates/execution/`
  - `.claude/skills/completion-verifier/SKILL.md`
  - `.claude/skills/moonshot-phase-executor/SKILL.md`
- change:
  - retry 시 `same direction refine` / `partial redesign` / `stop and handoff` 중 하나를 명시하게 한다.
  - 각 retry는 `delta hypothesis`를 기록하게 한다.
  - 같은 failure category가 반복되면 pivot 또는 human checkpoint를 요구한다.
- acceptance:
  - `QA_REPORT.md` 또는 `WORKSET.md`에 retry strategy가 구조화된다.
  - 동일 실패의 반복 루프가 왜 계속되는지 추적 가능해진다.

## 우선순위에서 제외한 항목

아래는 Anthropic 글에서 중요하지만, 현재 저장소에서는 당장 별도 workstream으로 올릴 필요가 낮다.

- context reset 자체를 핵심 기능으로 밀어넣기
  현재 저장소는 이미 `HANDOFF.md`, `WORKSET.md`, resumable-session 규약으로 세션 전환을 다룬다.
- 5-15회 반복하는 무거운 design loop를 기본 운영값으로 채택하기
  이 저장소는 앱 생성기보다 workflow repository 성격이 강하고, 비용 대비 기본값으로는 과하다.
- planner를 더 키워 upfront spec을 지나치게 상세화하기
  현재 저장소도 이미 high-level spec 우선 원칙을 갖고 있어, 과세부화는 오히려 하위 실행을 경직시킬 수 있다.

## 실행 순서

### Phase 1

- 기간: 1-2주
- 항목:
  - `AAP-001`
  - `AAP-002`
  - `AAP-003`
- 목표:
  현재 구조 위에 evaluator skepticism, 계약 리뷰, adaptive routing을 먼저 얹는다.

### Phase 2

- 기간: 2-4주
- 항목:
  - `AAP-004`
  - `AAP-005`
- 목표:
  runtime QA의 실제 깊이를 늘리고, retry loop가 무의미한 반복으로 흐르지 않게 만든다.

## 최종 판단

Anthropic 글을 현재 프로젝트에 그대로 이식할 필요는 없다.

이미 있는 구조를 기준으로 보면, 지금 필요한 것은 새로운 agent persona 추가가 아니라 다음이다.

- evaluator를 더 엄격하게 만드는 것
- 구현 전에 계약을 더 강하게 고정하는 것
- 하네스 복잡도를 task/model에 따라 가변화하는 것
- runtime QA를 더 깊게 만드는 것
- retry loop의 방향 전환 규칙을 명시하는 것

이 다섯 가지가 현재 `claude-settings`에서 비용 대비 효과가 가장 큰 적용점이다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/README.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-engineering-foundation.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- `.claude/docs/guidelines/long-running-harness.md`
- `.claude/docs/guidelines/verification-contract.md`
