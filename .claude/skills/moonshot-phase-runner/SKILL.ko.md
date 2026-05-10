---
name: moonshot-phase-runner
description: 준비된 plan package를 기준으로 large, phase 기반, long-running 구현 작업을 실행할 때 사용합니다.
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Moonshot Phase Runner

## 역할

Master plan 문서를 기반으로 phase별 구현을 준비합니다.
계획 검증, 불확실성 해소(Q&A), 그리고 실행 준비를 담당합니다.
또한 `/moonshot-orchestrator`가 재개할 수 있도록 핸드오프 메타데이터를 반환합니다.

이 스킬은 large, phase 기반, long-running 구현 작업의 기본 공개 진입점입니다.

실행 모드:
- `delegated-terminal`: `agent-loop.mjs` 기반의 실제 자율 루프를 사용하며, 중단 없이 끝까지 밀어야 하는 실행에 우선 사용
- `in-session-coordinator`: 현재 세션이 루프를 조율하되, 각 시도는 fresh fork/sub-agent round로 실행

실행 시작 정책:
- 기본값: 준비가 끝나면 즉시 실행까지 자동 시작
- `--prepare-only`: 상태만 준비하고 실행 메타데이터만 반환
- `delegated-terminal`에서는 준비 직후 실제 dispatch/agent-loop를 현재 세션에서 실행하고, loop가 끝나기 전에는 단발 요약으로 반환하지 않습니다.

의도 해석 규칙:
- "계속 진행", "개선작업 진행", "바로 실행", "phase 실행" 같은 표현은 package 준비 의도가 아니라 실행 의도로 해석합니다.
- 사용자가 명시적으로 planning/package-only 동작을 요청하거나 `--prepare-only`를 준 경우가 아니면 `prepareOnly: false`, `autoStartExecution: true`로 처리해야 합니다.
- Codex처럼 끝까지 끊김 없이 밀어야 하는 런타임에서는, 사용자가 interactive coordination을 원하거나 런타임 제약이 있는 경우가 아니면 `in-session-coordinator`보다 `delegated-terminal`을 우선합니다.

plan-directory 완료 규칙:
- 기본 auto-start 실행의 경계는 현재 phase 하나가 아니라 active plan directory 전체입니다.
- `phase-status.yaml`에 `pending`, `in_progress`, 또는 재시도 가능한 `failed` phase가 하나라도 남아 있으면 delegated-terminal 또는 in-session coordinator 루프를 계속 유지해야 합니다.
- phase 하나가 완료됐다는 사실만으로는 반환 경계가 되지 않습니다.

채널 / 반환 경계 규칙:
- `phase-status.yaml`에 `activeExecutionStatus: active`가 잡혀 있는 동안의 사용자 업데이트는 진행 보고/commentary 형태여야 합니다.
- `assert-return-allowed`가 통과하거나 명시적 중단 사유가 기록되기 전에는 `final` 응답, closeout 문구, 세션 종료처럼 들리는 표현을 쓰면 안 됩니다.
- phase 마일스톤, execution artifact 갱신, 다음 phase 진입은 종료형 응답 경계가 아닙니다.

review / finish gate 규칙:
- 필수 review와 finish-closeout 단계가 실제로 실행되기 전에는 phase package를 완료로 취급하면 안 됩니다.
- 코드 변경 phase는 `codex-review-code`가 applied workflow evidence에 기록되기 전까지 `clean_finish`를 허용하면 안 됩니다.
- `QA_REPORT.md`에서 `Review completed: no` 인 상태로 `Next path: clean_finish`를 선언하면 안 됩니다.
- phase closeout 시 `HANDOFF.md`와 closeout 필드는 seeded/placeholder 상태로 남아 있으면 안 됩니다.
- review 또는 closeout evidence가 비어 있으면 요약을 반환하지 말고, active plan-directory loop 안에서 빠진 단계를 보완해야 합니다.
- plan-directory 완료 요약 전에는 단일 closeout 진입점인 `node .claude/scripts/phase-closeout-finalize.mjs finalize --phase <NN> --status-file .claude/docs/phase-status.yaml --plan-dir <plan-dir> --master-plan <master-plan> --execution-root <execution-root> --json`을 실행해야 합니다.
- `phase-status.yaml`, workflow JSON, verdict, traceability evidence가 서로 충돌하는 세션은 먼저 `phase-closeout-finalize.mjs finalize --dry-run --json`으로 예상 변경과 blocker를 확인합니다.
- `phase-closeout-finalize.mjs`가 canonical final verdict 생성, phase-status root reconcile, workflow state reconcile, goal runtime close, traceability/scenario placeholder 생성, closeout verifier, Git closeout preflight를 한 경로로 수행합니다. finalizer 자체를 디버깅하는 경우가 아니면 이 단계들을 ad-hoc closeout 판단으로 분리하지 않습니다.
- 성공 반환 전에는 finalizer의 phase closeout gate가 통과해야 하고, finalizer가 쓴 파일을 커밋하거나 의도적으로 staging한 뒤 `node .claude/scripts/phase-final-git-closeout.mjs assert-clean --plan-dir <plan-dir> --status-file <status-file>`도 통과해야 합니다.

MemoryGraph 단계 규칙:
- phase run 전체에 `.claude/docs/guidelines/memorygraph-workflow.ko.md`를 적용합니다.
- runner는 plan writing, plan review, execution 위임 전에 Intake/Plan 조회를 담당합니다.
- 각 실행 attempt에는 요약된 `projectMemoryContext`만 전달하고 raw MemoryGraph record를 phase 문서나 attempt input에 inline하지 않습니다.
- `.claude/docs/ko/`는 제외하고, system/developer/AGENTS/rules 정책과 중복되는 MemoryGraph 항목은 병합하지 않습니다.
- MemoryGraph를 사용할 수 없으면 `boundaryStatus: not_checked`로 기록하고, strict memory gate가 명시적으로 실패한 경우가 아니면 계속 진행합니다.

실패 재발 방지 brief 규칙:
- phase-attempt prompt를 만들기 전에 runner는 ignored repo-local cache인 `.claude/cache/awtl/failed_turn_cases.jsonl`을 읽을 수 있습니다.
- active phase context와 매칭되는 compact failed-turn case가 있을 때만 `Failure Prevention Brief`를 주입합니다. cache가 없거나 매칭이 없으면 no-op입니다.
- brief는 최대 5개의 1문장 bullet이어야 하며 raw trace JSON, prompt body, stdout, stderr, secret-like string을 포함하면 안 됩니다.
- 이 cache read는 MemoryGraph 가용성과 독립적이며, 장기 메모리 promotion을 수행하지 않습니다.

## Workflow

```text
/moonshot-phase-runner [<plan-dir>] [--autonomous] [--execution-mode <mode>] [--prepare-only]
  0. MemoryGraph Intake 조회: `project-memory-agent(stage=intake, read_only)`
  1. Plan Directory 결정
  2. Plan Directory 검증
  3. phase-status.yaml 생성/업데이트
  4. execution bridge 아티팩트 시드
  5. MemoryGraph Plan 조회 후 Plan Review
  6. 실행 모드 결정
  7. MemoryGraph Execute 조회 후 실행 스킬 자동 시작
  8. MemoryGraph review / review / finish gate 강제
  9. phaseRunnerResult 반환
```

## Step 1: 계획 디렉토리 결정

`<plan-dir>`가 없으면 아래 순서로 결정합니다.
1. `.claude/docs/phase-status.yaml`의 active plan이 유효하면 재사용
2. `docs/implementation`에 유효한 master plan과 phase 문서가 있으면 재사용
3. 다른 implementation-plan 후보가 정확히 1개만 안전하게 발견되면 재사용
4. 그 외에는 `/moonshot-plan-writer`를 실행해 `docs/implementation`을 생성/갱신

후보가 여러 개이고 active plan이 명확하지 않으면 추측하지 말고 사용자에게 물어야 합니다.
`<plan-dir>/close/` 아래의 archived phase 문서는 이력이며 active phase 후보로 세지지 않습니다.

Phase 탐색 truth source:
- runner는 active phase를 비재귀 `<plan-dir>/NN-*.md` 파일셋에서 탐색하며 `00-*`는 제외합니다.
- master plan의 phase index는 필수 일관성 계약이지 탐색 source가 아닙니다.
- 선택된 master plan이 13-16만 참조해도 root에 오래된 09-12가 남아 있으면, archive/이동/명시적 reconcile 전까지 실행 가능한 package는 8개 phase로 잡힙니다.

## Step 2: 계획 디렉토리 검증

- 디렉토리 존재 확인
- master plan 찾기
- 비재귀 root `NN-*.md` phase 문서 개수 확인 (`00-*` 제외)
- 선택된 master plan의 phase 링크/체크리스트와 root `NN-*.md` 파일셋 대조
- stale execution 또는 root phase 문서가 있을 수 있으면 dispatch 전에 `prepare-implementation-plan-state.mjs --dry-run` 실행

## Step 3: phase-status.yaml 생성

각 phase 상태를 `pending`으로 초기화하고, execution artifact 경로를 기록합니다.
phase가 `completed`가 되면 해당 phase 문서는 `<plan-dir>/close/`로 이관하고, `phase-status.yaml`에는 `archivedPhaseDoc`를 남겨 active phase 탐색을 오염시키지 않습니다.

## Step 4: Execution Bridge 아티팩트 시드

각 phase마다 아래를 준비합니다.
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`
- `<plan-dir>/execution/<phase>/SCORECARD.md`

규칙:
- execution 아티팩트는 `.claude/templates/execution/` 템플릿을 기준으로 시드합니다.
- `SPRINT_CONTRACT.md`에는 policy anchors, review cadence, 종료 규칙이 있어야 합니다.
- `QA_REPORT.md`, `HANDOFF.md`는 실행 중 갱신될 placeholder로 시작합니다.
- `SCORECARD.md`는 objective weighted check와 target score를 포함한 상태로 시작합니다.
- `SCORECARD.md`는 `generic`, `saas`, `api-backend`, `frontend`, `platform` 중 적절한 preset profile로 시드해야 합니다.
- traceability artifact가 이미 있으면 첫 시도 전에 감지된 `REQ-*` / `SCN-*` 개수로 `REQ + SCN` 예산만 재배분합니다.
- `SCORECARD.md`는 phase 완료 선언 가능 여부를 제어하는 1급 아티팩트입니다.
- objective target score를 충족하기 전까지 `SCORECARD.md`의 기본 verdict는 `retry`로 유지합니다.
- 이미 작업 내용이 있는 파일은 덮어쓰지 않습니다.

## Step 5: Plan Review

`--autonomous`가 없을 때만 수행합니다.
- 각 phase 문서를 로드
- 불확실성 감지
- 질문/응답 반영
- `planConfirmed: true` 설정

`--autonomous`가 있으면 모든 phase를 `planConfirmed: true`로 설정하고 바로 진행합니다.

## Step 6: 실행 모드 결정

지원 값:
- `delegated-terminal` 기본값
- `in-session-coordinator`

### delegated-terminal
- `node .claude/scripts/moonshot-phase-dispatch.mjs`를 통해 `agent-loop.mjs`를 사용합니다.
- 자율 루프, 재시도, phase score gating이 필요한 실행의 기본 경로입니다.
- `partial`, `retry`, 체크포인트 문서 갱신, handoff 작성만으로는 멈추지 않습니다.
- 이 모드에서는 실제 loop exit가 생길 때만 반환합니다: 전체 완료, retry cap 도달, 명시적 사용자 중지, 또는 루프가 기록한 실제 blocker.
- 어떤 phase가 `completed`가 되더라도 같은 plan directory에 actionable phase가 남아 있으면 즉시 다음 phase로 이어가야 합니다.
- `.sh` wrapper는 compatibility 용도로 유지됩니다.

### in-session-coordinator
- 메인 세션은 얇은 coordinator로 남고, 각 시도는 fresh attempt로 실행합니다.
- 런타임이 fresh attempt를 강제하지 못하면 완전한 무중단 자율 루프 대신 interactive coordinator 모드로 취급합니다.

## 실행 계약

`phaseRunnerResult`는 최소한 아래 메타데이터를 제공해야 합니다.

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: "delegated-terminal"
  planDir: "docs/implementation"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
```

closeout 메타데이터 예시:

```yaml
  - number: 1
    status: completed
    archivedPhaseDoc: "docs/implementation/close/01-project-setup.md"
```

attempt 계약 예시:

```yaml
attemptInput:
  phaseNumber: 1
  phaseTitle: "Project Setup"
  phaseDocPath: "docs/implementation/01-project-setup.md"
  sprintContractPath: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/01-project-setup/SCORECARD.md"
```

attempt 결과 예시:

```yaml
attemptResult:
  status: "partial"
  verification:
    verdict: "failed"
    evidenceFresh: true
  score:
    current: 70
    target: 100
    unmetChecklistItems: 2
    blockingDefects: 1
    verdict: "retry"
```

## 규칙

- phase 기반 작업은 bounded direct path보다 이 스킬을 우선합니다.
- long-running execution에서는 `delegated-terminal`을 기본 경로로 봅니다.
- execution bridge가 준비되지 않았으면 phase 실행을 시작하지 않습니다.
- `prepareOnly != true` 이고 `executionMode == delegated-terminal`이면 `moonshot-phase-executor`는 실제 dispatch command를 즉시 실행해야 하며, 한 번의 conversational 구현 라운드로 대체하면 안 됩니다.
- active plan directory에 남은 phase가 있으면 completed phase 경계에서 사용자 진행 보고만 하고 반환하면 안 됩니다.
- phase 완료는 검증 통과만으로 충분하지 않습니다.
- phase 완료는 score verdict가 `done`이고 target score를 충족하며 checklist 미충족과 blocking defect가 0일 때만 가능합니다.
- 사용자의 최신 요청이 실행 의도였는데도 `prepareOnly: true`로 반환됐다면 계약 위반으로 보고, prepared-only 요약을 반환하지 말고 auto-start 실행 경로로 바로 교정해야 합니다.
- auto-start 실행에서는 live `phase-run-lease`를 시작하고 heartbeat를 유지해야 하며, 성공 반환 전에 `node .claude/scripts/phase-run-lease.mjs assert-return-allowed <status-file> <runLeaseId> true false`가 통과해야 합니다.
