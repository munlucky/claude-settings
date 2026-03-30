# Harness Report Application Ideas

Last-Reviewed: 2026-03-30

## 역할

- canonical proposal catalog

이 문서는 외부 Harness 리포트에서 도출한 적용 아이디어를 정리한다.
실제 실행 상태와 acceptance criteria는 `implementation-backlog.md`를 canonical source로 본다.

## 상태 요약

| ID | 제안 | 상태 | backlog |
|---|---|---|---|
| `HAP-001` | 패턴 인식형 팀 아키텍처 선택기 | `done` | `implementation-backlog.md` |
| `HAP-002` | 전략 게이트 분리 | `done` | `implementation-backlog.md` |
| `HAP-003` | solution memory 도입 | `done` | `implementation-backlog.md` |
| `HAP-004` | 스킬 3계층 taxonomy 규약화 | `done` | `implementation-backlog.md` |
| `HAP-005` | phase/slice handoff manifest 도입 | `done` | `implementation-backlog.md` |
| `HAP-006` | 하네스 관측 계층 추가 | `done` | `implementation-backlog.md` |

## 목적

이 문서는 외부 `revfactory/harness` 분석 리포트에서 제시한 개념을 현재 `claude-settings` 저장소에 어떻게 적용할지 정리한 실행 지향 문서다.

목표는 두 가지다.

- 외부 하네스 개념 중 현재 저장소에 이미 존재하는 요소와 아직 부족한 요소를 분리한다.
- 실제로 투자 가치가 높은 적용 아이디어를 우선순위와 도입 순서까지 포함해 제안한다.

## 한 줄 판단

현재 저장소는 이미 `강한 로컬 실행 하네스`다.

따라서 외부 Harness의 가치는 "멀티 에이전트가 좋다"는 일반론이 아니라, 다음 네 가지를 더 체계화하는 데 있다.

- 패턴 단위 팀 아키텍처 선택
- 전략적 의사결정 게이트 분리
- 경험의 재사용 가능 자산화
- 팀 실행 결과의 관측 가능성 강화

## 현재 저장소와의 매핑

외부 리포트의 핵심 개념을 현재 저장소에 매핑하면 다음과 같다.

| 외부 리포트 개념 | 현재 저장소의 대응 요소 | 현재 상태 | 핵심 갭 |
|---|---|---|---|
| 메타 스킬 기반 오케스트레이션 | `moonshot-orchestrator`, `product-orchestrator`, `moonshot-phase-runner` | 강함 | 패턴 자동 선택 규칙은 약함 |
| 6단계 자동화 프로세스 | `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff` | 강함 | 전략 게이트와 팀 I/O 계약이 분리돼 있지 않음 |
| 3계층 스킬 시스템 | orchestrator 계열, 도메인/검증 스킬, tool wrapper 계열 | 중상 | 공식 taxonomy와 progressive disclosure 강제가 부족함 |
| 팬아웃/팬인, 생산자-검토자 등 패턴형 팀 구조 | `moonshot-teams-runner`, `agent-teams-config.yaml` | 중상 | 팀은 있으나 패턴 메타와 자동 라우팅이 약함 |
| 파일 기반 협업과 오케스트레이션 | `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` | 강함 | phase 내부 workset/handoff manifest가 없음 |
| 결과물 변동성 감소를 위한 검증 분리 | `completion-verifier`, `browser-verifier`, `codex-review-code`, strict contract | 강함 | 팀 토폴로지별 효과 측정 계층이 없음 |
| 하네스 자가 개선 | `session-logger`, `gap-analysis`, workflow evidence | 중 | 해결 패턴 자동 승격 구조가 없음 |

## 적용 판단의 원칙

외부 Harness 리포트의 요소를 도입할 때는 다음 원칙을 따른다.

1. 이미 강한 구조는 중복 구현하지 않는다.
2. 오케스트레이터 내부 암묵 로직은 가능한 한 명시적 artifact 또는 skill로 승격한다.
3. 팀 추가보다 팀 선택 기준과 데이터 전달 규약을 먼저 고도화한다.
4. 문서가 늘어나는 만큼 재사용성과 검색성이 함께 증가해야 한다.

## 우선 적용 아이디어

### `HAP-001` 패턴 인식형 팀 아키텍처 선택기 도입

상태: `done`

#### 요지

현재 저장소는 `review-team`, `planning-team`, `impl-team`, `cross-layer-team`, `debug-team` 같은 팀 단위 템플릿은 이미 갖고 있다.

하지만 외부 Harness 리포트처럼 `pipeline`, `fanout_fanin`, `producer_reviewer`, `supervisor`, `hierarchical_delegation`을 먼저 선택하고, 그 위에 팀을 매핑하는 계층은 약하다.

#### 왜 필요한가

- 지금은 팀 이름이 먼저 보이고 데이터 흐름 패턴은 뒤에 숨어 있다.
- 같은 팀이라도 작업 특성에 따라 다른 협업 토폴로지가 필요하다.
- 장기적으로 팀 수가 늘어나면 이름 기반 선택은 유지보수 비용이 커진다.

#### 권장 적용

- `.claude/templates/agent-teams-config.yaml`에 각 팀의 `pattern`, `inputContract`, `outputContract`, `mergeStrategy` 메타데이터를 추가한다.
- `moonshot-orchestrator`가 먼저 작업 특성에 따라 패턴을 고른 뒤, 그 패턴에 맞는 팀 프리셋을 선택하도록 바꾼다.
- `moonshot-teams-runner`는 팀 실행기 역할에 집중하고, 패턴 선택은 오케스트레이터가 담당하게 분리한다.

#### 기대 효과

- 팀 증가에도 조합 폭발을 줄일 수 있다.
- 검토 시 "왜 이 팀을 골랐는가"를 설명 가능한 구조가 된다.
- Codex와 Claude Code 런타임 간 동등한 협업 패턴을 유지하기 쉬워진다.

### `HAP-002` 전략 게이트를 독립 스킬로 분리

상태: `done`

#### 요지

현재 저장소는 실행 readiness 판단은 강하지만, "이 작업을 지금 해야 하는가", "범위를 줄여야 하는가", "아키텍처가 과한가" 같은 상위 판단은 오케스트레이터와 리뷰 흐름에 흡수돼 있다.

#### 왜 필요한가

- 외부 Harness 리포트의 도메인 분석과 팀 아키텍처 설계는 사실상 상위 의사결정 레이어다.
- 현재 갭 분석에서도 제품/범위 판단과 아키텍처 완결성 판단이 독립 레이어로 부족하다고 명시돼 있다.
- 구현 전 scope reduction을 강하게 만들수록 후속 루프 비용이 크게 줄어든다.

#### 권장 적용

- `plan-ceo-review`에 대응하는 제품/범위 리뷰 스킬을 추가한다.
- `plan-eng-review`에 대응하는 아키텍처/완결성 리뷰 스킬을 추가한다.
- `product-orchestrator`와 `moonshot-plan-writer`의 각 주요 산출물 단계 뒤에 이 스킬들을 끼워 넣는다.
- 결과는 `pass`, `conditional_pass`, `scope_reduction`, `hold_scope`, `fail` 중 하나로 남긴다.

#### 기대 효과

- "잘 짠 계획"과 "할 가치 있는 계획"을 분리해 다룰 수 있다.
- 구현 루프에 들어가기 전 비용 낭비를 줄인다.
- 추후 `policySets -> OPA/Rego` 연결을 위한 상위 판단 노드로 확장하기 쉽다.

### `HAP-004` 스킬 3계층 taxonomy와 progressive disclosure를 저장소 규약으로 고정

상태: `done`

#### 요지

현재 저장소는 사실상 3계층 구조를 이미 갖고 있지만, 그 구조가 명시적 운영 규약으로 고정돼 있지는 않다.

#### 왜 필요한가

- 스킬 수가 많아질수록 분류 체계가 없으면 오케스트레이터가 비대해진다.
- 외부 Harness 리포트의 강점은 스킬 내용 그 자체보다 문맥 부하를 관리하는 방식에 있다.
- 현재 저장소도 context pollution 방지를 강조하지만, 모든 스킬이 같은 형식으로 작성돼 있지는 않다.

#### 권장 적용

- 모든 스킬을 아래 세 층 중 하나로 분류한다.
  - `orchestrator`
  - `agent_extending`
  - `external_interface`
- `SKILL.md` frontmatter에 `layer`, `loads`, `deepReferences`, `outputArtifacts` 같은 메타를 추가한다.
- 본문 구조를 `summary -> routing rules -> execution contract -> deep references` 순서로 통일한다.
- `skill-composition.md`에 계층별 책임과 로딩 규칙을 추가한다.

#### 기대 효과

- 새 스킬이 늘어나도 로딩 규율과 책임 경계가 유지된다.
- Codex에서 필요한 규칙만 명시적으로 전파하기 쉬워진다.
- 장기적으로 자동 스킬 생성이나 스캐폴딩의 기반이 된다.

### `HAP-005` phase/slice 내부 handoff manifest 도입

상태: `done`

#### 요지

현재 저장소는 phase 간 artifact는 강하지만, 팀 내부나 동일 phase 내 재시도 루프에서 "무엇을 읽고 무엇을 넘길지"를 더 좁게 제한하는 workset 규약은 약하다.

#### 왜 필요한가

- 외부 Harness 리포트는 파일 기반 협업을 통해 에이전트가 필요한 산출물만 참조하도록 만든다.
- 현재 구조는 `SPRINT_CONTRACT`, `QA_REPORT`, `HANDOFF` 같은 큰 문서는 잘 갖추고 있지만, 세부 round 수준 전달 규약은 상대적으로 느슨하다.
- 병렬 팀 실행이 늘수록 shared context를 줄이는 것이 중요해진다.

#### 권장 적용

- 각 active slice에 `WORKSET.md` 또는 `handoff.json`을 둔다.
- 필수 필드는 다음 정도로 시작한다.
  - current goal
  - in-scope paths
  - produced artifacts
  - required reads
  - verification commands
  - unresolved risks
- `moonshot-phase-executor`와 `moonshot-in-session-coordinator`가 새 round를 시작할 때 이 manifest를 갱신한다.

#### 기대 효과

- 병렬 실행 시 충돌과 중복 읽기를 줄일 수 있다.
- 다음 agent가 필요한 파일만 읽도록 유도할 수 있다.
- 긴 세션과 context compaction 이후에도 복구성이 좋아진다.

### `HAP-003` QA/Handoff를 solution memory로 승격하는 경험 복리 구조 도입

상태: `done`

#### 요지

현재 저장소는 실행과 검증 기록은 잘 남기지만, 그 기록을 다음 작업에서 재사용 가능한 해결 자산으로 승격하는 체계는 없다.

#### 왜 필요한가

- 외부 Harness 리포트가 강조하는 실전 가치 중 하나는 도메인별 하네스의 재사용성이다.
- 이 저장소에서 그에 해당하는 자산은 `docs/solutions/` 또는 패턴 라이브러리다.
- 반복적으로 등장하는 실패 유형과 검증 레시피를 다음 플랜 단계의 입력으로 돌려야 진짜로 성능이 누적된다.

#### 권장 적용

- `.claude/docs/solutions/` 또는 동등한 경로를 만든다.
- `QA_REPORT`와 `HANDOFF` 중 재사용 가치가 있는 항목을 `solution asset`으로 승격하는 규칙을 만든다.
- 자산 최소 메타데이터는 다음을 포함한다.
  - problem type
  - root cause
  - fix pattern
  - verification recipe
  - anti-pattern
  - reusable paths or examples
- `session-logger` 또는 후속 전용 스킬이 승격 후보를 기록하게 한다.

#### 기대 효과

- 실패 분석이 문서 보관에 그치지 않고 다음 실행의 입력이 된다.
- 새 에이전트가 과거 해결 패턴을 더 빠르게 재사용할 수 있다.
- "지식 저장"에서 "지식 복리"로 단계가 올라간다.

### `HAP-006` 하네스 관측 계층 추가

상태: `done`

#### 요지

현재 저장소는 strict verdict, workflow evidence, verification result는 갖고 있지만, 어떤 팀 토폴로지와 루프 구성이 실제로 품질을 올리는지 추적하는 계층은 약하다.

#### 왜 필요한가

- 외부 Harness 리포트는 품질 향상과 변동성 감소를 정량적으로 주장한다.
- 현재 저장소도 같은 종류의 증거를 쌓아야 어떤 하네스 패턴이 유효한지 판단할 수 있다.
- 관측이 없으면 팀 구조는 계속 늘어나도 실제 효과를 알기 어렵다.

#### 권장 적용

- verdict JSON과 workflow evidence를 바탕으로 최소 지표를 추가한다.
  - selected pattern
  - selected team
  - retry count
  - handoff count
  - indeterminate ratio
  - verifier failure categories
  - completion lead time
- 팀 실행 후 `.claude/docs/team-reports/`와 별개로 집계 가능한 `metrics/*.json`을 남긴다.
- `efficiency-tracker`가 패턴별 성공률과 비용 신호를 요약하도록 확장한다.

#### 기대 효과

- 어떤 팀 구조가 어떤 작업에서 효과적인지 점진적으로 학습할 수 있다.
- 하네스 복잡도를 실제 데이터로 줄이거나 늘릴 수 있다.
- 장기적으로 조직 단위 scorecard와 연결하기 쉬워진다.

## 우선순위

### P1

- 패턴 인식형 팀 아키텍처 선택기
- 전략 게이트 분리
- solution memory 도입

### P2

- skill 3계층 taxonomy와 progressive disclosure 규약화
- phase/slice handoff manifest 도입

### P3

- 하네스 관측 계층
- `policySets -> OPA/Rego` 외부화 설계
- 팀 토폴로지별 scorecard 정교화

## 추천 도입 순서

### 1단계: 빠른 효과

- `agent-teams-config.yaml`에 패턴 메타데이터 추가
- `moonshot-orchestrator`에서 패턴 선택 필드 추가
- 제품/범위 리뷰 스킬, 아키텍처 리뷰 스킬 초안 작성

이 단계의 목표는 "팀을 더 많이 만드는 것"이 아니라 "왜 이 팀을 썼는지 설명 가능한 구조"를 만드는 것이다.

### 2단계: 재사용성 강화

- `WORKSET.md` 또는 `handoff.json` 도입
- `docs/solutions/` 구조 초안 작성
- `session-logger` 또는 별도 스킬에 solution 승격 후보 기록 추가

이 단계의 목표는 실행 로그를 다음 실행의 자산으로 바꾸는 것이다.

### 3단계: 운영체제화

- metric schema 설계
- `efficiency-tracker`와 verdict JSON 연결
- 패턴별 성과 비교와 축소 기준 정의

이 단계의 목표는 하네스를 더 복잡하게 만드는 것이 아니라, 복잡도를 측정 가능하게 만드는 것이다.

## 구현 시 예상 파일 영향 범위

### 문서

- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/long-running-harness.md`
- `.claude/docs/guidelines/verification-contract.md`
- `.claude/docs/solutions/` 신규 경로

### 스킬

- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/skills/moonshot-teams-runner/SKILL.md`
- `plan-ceo-review` 성격의 신규 스킬
- `plan-eng-review` 성격의 신규 스킬
- `session-logger` 또는 solution memory 승격용 신규 스킬

### 템플릿 및 실행 아티팩트

- `.claude/templates/agent-teams-config.yaml`
- `.claude/templates/execution/` 하위 문서
- `WORKSET.md` 또는 `handoff.json` 템플릿

### 관측 및 검증

- `.claude/verification.contract.yaml`
- `efficiency-tracker`
- workflow evidence 또는 verdict JSON 생성 지점

## 하지 말아야 할 것

- 팀 종류를 먼저 늘리고 패턴 메타는 나중으로 미루는 것
- solution memory 없이 문서만 계속 추가하는 것
- 오케스트레이터 내부 암묵 로직을 문서화 없이 늘리는 것
- 관측 없이 팀 실행을 복잡하게 만드는 것
- 현재 이미 강한 strict verification 구조를 약화시키는 것

## 결론

외부 Harness 리포트가 현재 저장소에 주는 가장 큰 시사점은 "멀티 에이전트를 도입하라"가 아니다.

실제 시사점은 다음과 같다.

- 팀을 패턴 단위로 추상화하라.
- 전략 판단을 실행 판단과 분리하라.
- 실행 기록을 다음 실행의 자산으로 승격하라.
- 하네스 자체를 측정 가능한 시스템으로 바꿔라.

현재 저장소는 이미 실행 하네스의 기반을 충분히 갖추고 있다.
다음 단계는 패턴화, 전략화, 자산화, 관측화다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/README.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-engineering-foundation.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`
- `.claude/docs/guidelines/long-running-harness.md`
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/requirements-traceability-harness.md`
