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
- `delegated-terminal`: `agent-loop.sh` 기반의 실제 자율 루프를 사용하며, 중단 없이 끝까지 밀어야 하는 실행에 우선 사용
- `in-session-coordinator`: 현재 세션이 루프를 조율하되, 각 시도는 fresh fork/sub-agent round로 실행

실행 시작 정책:
- 기본값: 준비가 끝나면 즉시 실행까지 자동 시작
- `--prepare-only`: 상태만 준비하고 실행 메타데이터만 반환

## Workflow

```text
/moonshot-phase-runner [<plan-dir>] [--autonomous] [--execution-mode <mode>] [--prepare-only]
  1. Plan Directory 결정
  2. Plan Directory 검증
  3. phase-status.yaml 생성/업데이트
  4. execution bridge 아티팩트 시드
  5. Plan Review
  6. 실행 모드 결정
  7. 실행 스킬 자동 시작
  8. phaseRunnerResult 반환
```

## Step 1: 계획 디렉토리 결정

`<plan-dir>`가 없으면 아래 순서로 결정합니다.
1. `.claude/docs/phase-status.yaml`의 active plan이 유효하면 재사용
2. `docs/implementation`에 유효한 master plan과 phase 문서가 있으면 재사용
3. 다른 implementation-plan 후보가 정확히 1개만 안전하게 발견되면 재사용
4. 그 외에는 `/moonshot-plan-writer`를 실행해 `docs/implementation`을 생성/갱신

후보가 여러 개이고 active plan이 명확하지 않으면 추측하지 말고 사용자에게 물어야 합니다.

## Step 2: 계획 디렉토리 검증

- 디렉토리 존재 확인
- master plan 찾기
- phase 문서 개수 확인

## Step 3: phase-status.yaml 생성

각 phase 상태를 `pending`으로 초기화하고, execution artifact 경로를 기록합니다.

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
- `.claude/scripts/moonshot-phase-dispatch.sh`를 통해 `agent-loop.sh`를 사용합니다.
- 자율 루프, 재시도, phase score gating이 필요한 실행의 기본 경로입니다.

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
- phase 완료는 검증 통과만으로 충분하지 않습니다.
- phase 완료는 score verdict가 `done`이고 target score를 충족하며 checklist 미충족과 blocking defect가 0일 때만 가능합니다.
