---
name: moonshot-plan-writer
description: phase 기반 작업을 위해 `docs/implementation`의 master plan과 phase plan을 생성, 갱신, 정리할 때 사용합니다.
---

# Implementation Plan Writer

## 목표
`docs/implementation`에 master/phase 구조가 일관된 작업계획 문서를 만든다.
기존 구현/작업 문서를 정리해 활성 plan package, 오래된 plan package, 런타임 증빙, 중복 draft를 구분 가능하게 유지한다.

이 스킬은 안전하게 재사용할 `<plan-dir>`가 없을 때 `moonshot-phase-runner`의 기본 bootstrap 역할을 한다.
phase 문서 기준 워크플로우에서는 Plan stage의 핵심 소유자다.

## 필수 입력
- 하나 이상의 요구사항 소스 문서(고정 파일명 아님):
  - 존재 시 우선: `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`
  - 대체 소스: `docs/PRD*.md`, `docs/SPEC*.md`, `docs/GDD*.md`, 루트 요구사항/설계 문서, 이슈/티켓, 사용자 요청문
- 계획 디렉토리 경로 (기본: `docs/implementation`)
- 기존 작업문서 확인 경로(기본: 계획 디렉토리 + 설정된 `documentPaths.tasksRoot`)
- 페이즈 목록 (기존 문서 또는 사용자 지정 범위)

## 기준 문서 우선순위
- 파일명이 아니라 문서의 역할(semantic role) 기준으로 우선순위를 적용한다.
- 충돌 시 우선순위:
  1. 범위/우선순위 소스(PRD 계열)
  2. 기술 계약 소스(SPEC 계열)
  3. 경험/상호작용 소스(GDD 계열)
- 같은 역할 문서가 여러 개면 가장 명시적이고 최신 기준 문서를 선택하고 선택 근거를 남긴다.
- 역할 문서가 일부 없으면 가용 소스로 진행하되 누락 기준은 master-plan에 gap/open decision으로 명시한다.
- 안전하게 해소할 수 없는 충돌은 계획 문서에 의사결정 필요 항목으로 명시한다.

## Runnable Readiness Gate

PRD/SPEC/GDD 문서는 기본적으로 executable contract가 아니라 requirement source입니다.
Runnable phase state를 준비하기 전에 선택된 source를 Goal Contract로 정규화하고 명시적 evidence로 readiness를 채점합니다.

필수 Goal Contract readiness fields:
- `goalClarity`
- `scopeClarity`
- `acceptanceCriteriaClarity`
- `verificationClarity`
- `clarityScore`
- `ambiguityScore`
- `readinessDecision`

Thresholds:
- `ambiguityScore <= 0.20`: executable
- `0.20 < ambiguityScore <= 0.35`: assumptions를 둔 constrained execution
- `ambiguityScore > 0.35`: clarification 또는 user-approved replan 전까지 blocked

Gap detection은 다음을 포함해야 합니다.
- measurable evidence 없는 "fast", "intuitive", "robust", "simple" 같은 unverifiable adjective
- non-goals 또는 excluded scope 누락
- verification commands 누락
- missing 또는 ambiguous acceptance criteria
- existing code/docs가 작업에 포함될 때 brownfield readiness context 누락

Routing:
- non-critical ambiguity는 active package의 assumptions ledger path로 보냅니다.
- core goal/scope/verification ambiguity는 blockers로 보내고 runnable closeout을 막습니다.
- product-value와 brownfield readiness concern은 public command를 추가하지 말고 stage-owner review evidence로 기록합니다.

Acceptance criteria extraction:
- source requirements와 phase completion criteria에서 stable `AC-*` ids를 생성합니다.
- 각 `AC-*`는 source label과 evidence target을 유지해야 합니다.
- master traceability와 phase docs는 이후 WORKSETS/QA evidence가 붙을 `AC-*` ids를 참조해야 합니다.

## 독립 Planning Loop

사용자가 이 스킬에 계획, draft, PRD/SPEC package, 구현 요청을 전달하면 현재 세션은 **Planning Controller**로 두고, review와 rewrite는 별도 세션에서 수행해 plan package가 실행 가능해질 때까지 반복합니다.

필수 역할:
- **Planning Controller**: 현재 세션. source 선택, iteration state, artifact path, 최종 readiness decision을 소유합니다.
- **Reviewer Agent**: fresh fork/sub-agent 또는 동등한 격리 세션. 읽기 전용입니다. 현재 master/phase package를 채점하고 구조화된 review output만 반환합니다.
- **Writer Agent**: fresh fork/sub-agent 또는 동등한 격리 세션. active plan package와 planning-loop artifact만 작성합니다. reviewer directive를 받아 ambiguity를 줄이는 방향으로 계획을 고칩니다.

Runtime requirement:
- Reviewer Agent와 Writer Agent 모두 실제 fork/sub-agent 세션을 우선합니다.
- 현재 사용자 요청이 이 스킬을 지목했지만 sub-agent, delegation, parallel agent work를 명시 승인하지 않았으면, 독립 Planning Loop 직전에 멈추고 isolated Reviewer Agent와 Writer Agent 세션 실행 권한을 묻는 짧은 yes/no 질문을 합니다. 사용자가 거절하거나 답하지 않거나, 승인 후에도 런타임이 격리 세션을 제공하지 못할 때까지 `isolationMode: "unavailable"`로 낮추지 않습니다.
- 사용자의 "yes", "진행", "Reviewer Agent와 Writer Agent를 분리해서 실행해줘" 같은 응답은 loop에 대한 명시 승인으로 취급합니다. 이 승인은 `controller-state.yaml`에 기록합니다.
- 런타임이 격리 세션을 제공하지 못하면 `isolationMode: "unavailable"`을 기록하고 strict runnable readiness를 주장하지 않습니다. 사용자가 degraded path를 명시 승인하지 않으면 package는 `constrained` 또는 `blocked`로만 반환합니다.
- Reviewer Agent는 파일을 수정하면 안 됩니다. Writer Agent는 사용자 명시 요청 없이는 선택된 plan package 밖의 source code, runtime state, scripts, verification baselines를 변경하면 안 됩니다.

Loop contract:
```text
iteration = 1
while true:
  1) Controller가 현재 master/phase plan package를 준비하거나 갱신한다.
  2) Reviewer Agent가 고정 rubric으로 package를 채점하고 planQualityReview를 낸다.
  3) ambiguityScore <= 0.20이고 blockingFindings가 없으며 improvementDirectives도 남지 않으면 decision=pass로 종료한다.
  4) ambiguityScore > 0.35이거나 core goal/scope/verification gap이 있으면 directive가 실행 가능할 때만 Writer Agent로 한 번 보낸다. 아니면 decision=blocked로 종료한다.
  5) Writer Agent가 ambiguity 감소에 필요한 directive만 적용하고 planWriterRevision을 낸다.
  6) Controller가 iteration artifact를 <plan-dir>/planning-loop/ 아래에 기록한다.
  7) Reviewer Agent가 실행 가능한 improvementDirectives를 반환하는 동안 pass 또는 maxIterations 도달까지 반복한다.
```

기본 제한:
- `maxIterations: 4`
- `targetAmbiguityScore: 0.20`
- `blockedAmbiguityScore: 0.35`
- `maxIterations`를 소진해도 target을 충족하지 못하면 `revise_exhausted`로 판정하고, 사용자가 constrained execution을 승인하기 전까지 runnable로 보지 않습니다.
- reviewer 결과의 `improvementDirectives`가 비어 있지 않으면 `ambiguityScore <= 0.20`이어도 Writer Agent로 보내야 합니다. 단, 모든 directive가 근거와 함께 non-actionable 또는 out-of-scope로 명시된 경우는 예외입니다.

고정 scoring rubric:
- `goalClarity` weight `0.20`
- `scopeClarity` weight `0.20`
- `acceptanceCriteriaClarity` weight `0.20`
- `verificationClarity` weight `0.20`
- `brownfieldReadiness` weight `0.10`
- `phaseExecutability` weight `0.10`

각 score는 `0.00`부터 `1.00`까지 evidence 기반으로 매깁니다. `totalScore`는 weighted sum, `ambiguityScore`는 `1 - totalScore`로 계산합니다. 점수를 올릴 때는 근거가 되는 파일, 섹션, AC id, command, phase metadata를 반드시 적습니다.

필수 planning-loop artifact:
- `<plan-dir>/planning-loop/controller-state.yaml`
- `<plan-dir>/planning-loop/plan-quality-review-iter-<NN>.yaml`
- `<plan-dir>/planning-loop/plan-writer-revision-iter-<NN>.yaml`

필수 `planQualityReview` shape:
```yaml
planQualityReview:
  schemaVersion: 1
  iteration: 1
  isolationMode: "forked | unavailable"
  reviewerSession: "<session-id-or-runtime-label>"
  targetPlanPackage:
    planDir: "docs/implementation"
    masterPlan: "docs/implementation/00-master-plan-v<n>.md"
    phaseDocs: []
  rubric:
    goalClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    scopeClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    acceptanceCriteriaClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    verificationClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    brownfieldReadiness: { weight: 0.10, score: 0.0, evidence: [], findings: [] }
    phaseExecutability: { weight: 0.10, score: 0.0, evidence: [], findings: [] }
  totalScore: 0.0
  ambiguityScore: 1.0
  decision: "pass | revise | blocked | revise_exhausted"
  blockingFindings: []
  improvementDirectives: []
```

필수 `planWriterRevision` shape:
```yaml
planWriterRevision:
  schemaVersion: 1
  iteration: 1
  isolationMode: "forked | unavailable"
  writerSession: "<session-id-or-runtime-label>"
  directivesApplied: []
  filesChanged: []
  ambiguityReductionNotes: []
  remainingOpenDecisions: []
```

Controller closeout:
- 최종 `planQualityReview` 요약을 master plan의 Plan Quality Loop 섹션에 복사합니다.
- master plan의 `readinessDecision`은 최종 controller decision과 일치해야 합니다.
- 최종 `ambiguityScore <= 0.20`, blocking finding 없음, 실행 가능한 improvement directive 없음, phase inventory check 통과 전에는 strict runnable state로 `prepare-implementation-plan-state.mjs`를 실행하지 않습니다.

## 워크플로우
0. `project-memory-agent`를 `stage=plan`, `memoryMode=read_only`로 실행하고 요약된 `projectMemoryContext`만 병합한다.
   - 이전 결정, 도메인 용어, non-goal, architecture boundary를 planning delta로 사용한다.
   - `.claude/docs/ko/`는 MemoryGraph 소스로 사용하지 않는다.
   - system/developer/AGENTS/rules 정책과 중복되는 MemoryGraph 항목은 제외한다.
1. 가용 기준 문서를 탐색한 뒤 로드한다.
   - 우선 `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md` 존재 여부를 확인한다.
   - 누락 시 `docs/`와 루트 `*.md`에서 PRD/SPEC/GDD 계열 요구사항 문서를 탐색한다.
   - 요구사항 문서가 없으면 사용자 요청문/티켓을 임시 기준으로 사용하고 source-gap을 master-plan에 명시한다.
   - 요구사항 단위를 추출하고 추적 ID를 부여한다 (예: `PRD-5.1`, `SPEC-2.4`, `GDD-3.2`, `REQ-1.1`).
   - stable acceptance criteria ids(`AC-*`)를 source labels와 evidence targets와 함께 추출한다.
   - plan package를 runnable로 취급하기 전에 readiness gaps를 기록한다.
2. 작성 전에 기존 구현/작업문서 컨텍스트를 인벤토리화하고 정리한다.
   - 루트 `*.md` 파일(비재귀)을 읽는다.
   - `docs/implementation/*.md`를 읽는다.
   - runner의 active phase source of truth는 비재귀 `<plan-dir>/NN-*.md` 파일셋이다. `00-*`와 `<plan-dir>/close/*`는 제외한다.
   - 파일 생성/갱신 전에 선택된 master plan의 phase 링크/체크리스트와 root `NN-*.md` 파일셋을 대조한다.
   - 오래된 root phase 문서가 runner에 같이 잡힐 수 있으면 실행 준비 전에 보존 archive 또는 이동 절차로 정리한다. 새 master plan이 참조하지 않는다는 이유만으로 root에 남겨두면 안 된다.
   - 설정된 `documentPaths.tasksRoot`가 있으면 관련 작업문서가 요청된 계획과 중복되거나 대체 관계인지 task 디렉토리를 비재귀로 확인한다.
   - 현재 master 파일명을 식별한다 (`00-master-plan-v*.md` 우선).
   - 발견된 계획/작업 문서를 `active-current`, `active-ambiguous`, `superseded`, `overlapping-draft`, `runtime-evidence`, `unrelated`로 분류한다.
   - 중복 package를 새로 만들기보다 가장 적절한 active/current package 갱신을 우선한다.
   - overlapping draft를 선택된 master/phase plan set에 통합할 때 사용자 결정, 제약, 증빙 링크, 완료 체크리스트 상태를 보존한다.
   - 활성 package가 모호하면 조용히 이동/삭제/덮어쓰기하지 말고 open decision으로 기록한다.
   - 오래된 package가 명확히 superseded라면 명시적 archive/preservation 절차로만 이동하고, 안전한 archive 관례가 없으면 superseded note를 남긴다.
3. 소스 추적 매핑을 만든다.
   - 각 기준 요구사항을 하나의 대상 페이즈 문서에 매핑한다.
   - 추출한 `AC-*` ids를 source requirement와 target phase에 매핑한다.
   - 미매핑 항목은 누락(gap)으로 명시한다.
4. master-plan을 생성/갱신한다.
   - master-plan은 "모든 계획의 계획"으로 취급한다.
   - 페이즈 목록과 의존/순서 요약을 포함한다.
   - 소스 추적 매트릭스(`탐색된 요구사항 소스 -> Phase`)를 포함한다.
   - 페이즈 완료 체크리스트를 포함한다.
   - 범위나 비용이 넓어 보이면 master plan에 대해 `plan-ceo-review`를 실행한다.
5. 각 페이즈 계획 문서를 생성/갱신한다.
   - 각 문서는 독립 세션에서 바로 실행 가능한 상세 계획이어야 한다.
   - 숨은 전제 없이 단독 실행 가능한 정보를 포함한다.
   - 기준 문서 추적 ID를 포함한 소스 매핑 섹션을 포함한다.
   - 생성/수정/테스트할 정확한 파일, 실행할 정확한 명령, 예상 fail/pass signal, blocker 조건, review checkpoint, verification evidence path를 포함한다.
   - 의존성, 소유권, 검증 경로가 비사소하면 `plan-eng-review`를 실행한다.
6. 독립 Planning Loop를 실행한다.
   - 4, 5단계의 현재 master/phase package를 입력으로 사용한다.
   - Reviewer Agent를 별도 세션에서 실행하고 `plan-quality-review-iter-<NN>.yaml`을 기록한다.
   - reviewer가 `decision: revise`를 반환하면 Writer Agent를 별도 세션에서 실행하고 `plan-writer-revision-iter-<NN>.yaml`을 기록한다.
   - `ambiguityScore <= 0.20`이고 blocking finding과 실행 가능한 improvement directive가 없거나, `blocked` / `revise_exhausted`가 될 때까지 반복한다.
   - non-critical assumption은 assumptions ledger에 남기고, core goal/scope/verification gap은 blocker로 유지한다.
7. plan package가 다음 실행 대상이면 실행 가능한 phase 상태를 준비한다.
   - 활성 root plan 문서는 보존한다.
   - 오래된 runtime/evidence surface는 삭제하지 말고 archive한다.
     - `docs/implementation/execution`
     - `docs/implementation/close`
     - 이전 `.claude/docs/phase-status.yaml` active pointer
     - `.claude/logs/workflow-enforcement/current-run.json`
     - `.claude/logs/workflow-enforcement/active-phase-run.json`
     - `.claude/logs/workflow-enforcement/latest-dispatch.json`
     - 오래된 master plan 또는 execution root를 가리키는 `.claude/logs/workflow-enforcement/dispatch-*.json`
   - stale `masterPlan`/`executionRoot` pointer 누수는 준비 실패로 취급한다. 예: v9 실행 중 top-level `current-run.json`은 v8을 가리키고 embedded `phaseRunLease`만 v9인 상태는 작업 시작 전 초기화가 깨진 것이다. phase-runner dispatch 전에 멈추고 준비 상태를 고친다.
   - 사용:
     ```bash
     node .claude/scripts/prepare-implementation-plan-state.mjs \
       --plan-dir docs/implementation \
       --master-plan docs/implementation/00-master-plan-v{n}.md \
       --status-file .claude/docs/phase-status.yaml \
       --execution-root docs/implementation/execution/<plan-slug>
     ```
   - 기존 `execution`, `close`, `phase-status.yaml`가 다른 활성 작업흐름에 속할 수 있으면 먼저 `--dry-run`으로 확인한다.
   - 이 준비 단계에서는 `.claude/scripts`, `.claude/runtime-state.sqlite`, `.claude/memory.json`, `.claude/verification.contract.yaml`, project settings, verification baseline을 건드리지 않는다.
   - 준비 후 dispatch 전에 pointer self-check를 수행한다.
     - `phase-status.yaml`은 선택된 master plan과 execution root를 가리키고 phase 1을 pending/prepared로 표시하며 현재 plan의 phase docs만 나열해야 한다.
     - dry-run summary의 `phaseInventoryCheck`는 `rootPhaseDocs`와 `masterPlanPhaseRefs`가 일치해야 한다. master plan에 명시적 phase 참조가 없는 경우만 미확인으로 기록할 수 있으며, `extraInRoot` 또는 `missingFromRoot`가 있으면 준비 실패다.
     - `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`은 없거나 archive되어야 하며, 남아 있으면 top-level과 embedded `phaseRunLease` 모두 선택된 master plan/execution root를 가리켜야 한다.
     - actionable phase가 pending, in_progress, blocked, retryable 중 하나로 남아 있으면 `goalRuntime.status`는 `complete`이면 안 된다.
     - remaining/actionable phase count는 master checklist와 phase-status phase list에 맞아야 한다.
   - 저장소에 note 필드가 있으면 오래된 runtime/evidence surface의 archive 위치를 master plan 또는 phase status notes에 기록한다.
8. 완료 상태를 동기화한다.
   - 페이즈 완료 시 즉시 master 체크리스트를 `[x]`로 갱신한다.
   - `[x]` 처리 근거(증빙 경로/검증 결과)를 함께 기록한다.
9. 완료 루프를 적용한다.
   - 모든 기준 요구사항이 매핑되고, master 체크리스트의 모든 항목이 `[x]`가 될 때까지 반복한다.
   - 체크리스트 미완료 상태에서는 전체 완료로 선언하지 않는다.
   - master plan 생성만으로 실행 준비 완료라고 보지 않는다. 실행 가능한 준비 완료는 root phase 문서 정리, `prepare-implementation-plan-state.mjs --dry-run`, 선택된 package와 일치하는 phase count 확인까지 포함한다.

## Master Plan 규칙
- 파일명: `docs/implementation/00-master-plan-v{n}.md` (기존 관례가 있으면 유지).
- 필수 섹션:
  - 실제 선택된 기준 문서 목록(가능하면 역할 라벨 포함)
  - 전체 구현 범위/목표
  - 페이즈 목록 + 문서 링크
  - 페이즈 의존/순서 메모
  - 소스 추적 매트릭스:
    - 컬럼: `Req ID`, `AC ID`, `Source`, `Requirement Summary`, `Phase`, `Plan File`, `Status`
  - 미매핑 기준 요구사항 섹션(존재 시)
  - `Phase Completion Checklist` 섹션 (마크다운 체크박스 `- [ ]`, `- [x]`)
- 체크리스트 규칙:
  - 페이즈당 1개 항목을 1:1로 매핑한다.
  - 항목 표기: `Phase NN - <title> (<file>)`
  - 해당 페이즈 문서의 완료 기준이 충족된 경우에만 `[x]` 처리한다.

## 페이즈 문서 규칙
- 파일명 패턴: `docs/implementation/{NN}-{phase-name}-v{n}.md`
- 각 문서에 다음을 포함한다:
  - 소스 매핑 (`Req ID` + 선택된 기준 문서 섹션 참조)
  - acceptance criteria mapping (`AC-*` + source requirement + expected evidence)
  - 목표와 기대 결과
  - 범위 / 비범위
  - 선행조건과 입력값
  - 상세 태스크 분해(순서 + ID)
  - 검증/테스트 계획
  - 산출물
  - 객관식 완료 기준 체크리스트
- "구현한다" 수준의 모호한 문장만 쓰지 말고, 실행/검증 가능한 단위로 작성한다.
- 각 task는 아래를 명시해야 한다.
  - 생성/수정/테스트할 정확한 파일 또는 모듈
  - 실행할 정확한 명령
  - 예상 failing/passing signal
  - 실행을 멈출 blocker condition
  - review checkpoint
  - verification evidence path

## 기존 문서 정리 규칙
- 새 master/phase 파일을 만들기 전에 항상 기존 계획/작업문서를 인벤토리화한다.
- 현재 master plan, 참조된 phase docs, 활성 phase status pointer, 또는 요청 작업흐름과 맞는 최근 execution/close 증빙이 있으면 해당 plan package를 active로 취급한다.
- 더 최신 master plan 또는 명시적 closeout 증빙이 같은 범위를 포괄할 때만 superseded로 취급한다.
- 정리 과정에서 기존 plan, task, evidence, 사용자 결정 문서를 삭제하지 않는다. archive하거나 note를 남긴다.
- 두 문서가 같은 범위를 다루면 하나의 canonical target을 선택하고 durable decision과 증빙 참조를 병합한 뒤, 비canonical 문서는 archive note 또는 superseded note로 발견 가능하게 남긴다.
- 정리 후 파일명, phase 번호, 체크리스트 항목, source trace ID, phase-status pointer의 일관성을 유지한다.
- 계획 디렉토리 또는 설정된 task root 밖으로 문서를 옮겨야 한다면 멈추고 확인을 요청한다.

## 완료 루프 (핵심)
계획 생성/갱신 시 아래 루프를 강제한다.

```text
while (master 체크리스트에 [ ] 존재) OR (미매핑 기준 요구사항 존재):
  1) 미완료 phase 또는 미매핑 요구사항 선택
  2) 대상 phase 문서의 독립 실행 상세계획 완전성 확인
  3) 소스 추적 ID가 태스크/완료기준과 연결되는지 확인
  4) 완료 기준 충족/근거 존재 여부 검증
  5) 충족 시 master를 [x]로 변경, 미충족 시 [ ] 유지 + 누락 보강
  6) 체크리스트와 소스 매핑이 모두 완료될 때까지 반복
```

구현이 끝난 것처럼 보여도 체크리스트가 남아 있으면 검증/보강 반복을 계속한다.

## 템플릿
- master-plan 생성 시 `assets/master-plan.template.md`를 기준으로 사용한다.
- phase-plan 생성 시 `assets/phase-plan.template.md`를 기준으로 사용한다.

## 가드레일
- 저장소 근거 없이 내용을 추측하지 않는다.
- 기존 문서의 사용자 제약/결정 사항은 보존한다.
- 선택된 기준 문서의 요구사항을 근거 없이 누락하지 않는다. 제외 시 사유를 문서에 남긴다.
- 파일명/페이즈 번호/체크리스트 상태를 모든 문서에서 일관되게 유지한다.
- 검증 명령이나 소유권 경계가 암묵적이면 페이즈를 ready 상태로 선언하지 않는다.
- files, commands, expected signals, blocker condition, evidence path가 암묵적이면 페이즈를 ready 상태로 선언하지 않는다.
- ambiguity score가 `0.35`보다 높거나 core scope/verification gap이 unresolved이거나 추출된 `AC-*` ids의 source mapping이 없으면 phase ready로 선언하지 않는다.
- workflow-enforcement active pointer가 오래된 plan package를 가리키면 `moonshot-phase-runner`를 시작하지 않는다. plan 준비 단계에서 먼저 archive/rewrite한다.

## Phase Runner 연동

`moonshot-phase-runner`의 fallback으로 호출될 때:
- 기본 출력 디렉토리는 `docs/implementation`
- 결정된 master plan 경로와 plan directory를 반환한다
- 병렬 duplicate를 새로 만들기보다 기존 미완성 plan package를 우선 갱신한다
