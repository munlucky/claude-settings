---
name: moonshot-phase-runner
description: Master plan 기반 phase별 구현 자동화 - 계획 검증 및 실행 준비
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Moonshot Phase Runner

## Role

Master plan 문서를 기반으로 phase별 구현을 준비합니다.
계획 검증, 불확실성 해소(Q&A), 그리고 **실행 준비**를 담당합니다.
또한 `/moonshot-orchestrator`가 재개할 수 있도록 핸드오프 메타데이터를 반환합니다.

> **Note**: 실제 실행은 사용자가 별도 터미널에서 `agent-loop.sh`를 실행합니다.

## Usage

```bash
# 계획 디렉토리 지정
/moonshot-phase-runner docs/implementation/

# 자율 모드 (Q&A 스킵)
/moonshot-phase-runner docs/implementation/ --autonomous
```

## Workflow

```
/moonshot-phase-runner <plan-dir> [--autonomous]
    │
    ├─ 1. Plan Directory 검증
    │      └─ Master plan + phase 문서 확인
    │
    ├─ 2. phase-status.yaml 생성/업데이트
    │      └─ 각 phase 상태 초기화
    │
    ├─ 3. execution bridge 아티팩트 시드
    │      └─ `execution/<phase>/SPRINT_CONTRACT.md`
    │         와 `QA_REPORT.md`, `HANDOFF.md` placeholder 준비
    │
    ├─ 4. Plan Review (--autonomous 미지정 시)
    │      └─ 불확실성 감지 → Q&A → planConfirmed: true
    │
    ├─ 5. 실행 명령어 출력
           └─ 사용자가 복사해서 실행
    
    └─ 6. 핸드오프 요약 반환
           └─ 오케스트레이터가 읽을 수 있는 phaseRunnerResult 반환
```

## Step 1: 계획 디렉토리 검증

```yaml
validation:
  - 디렉토리 존재 확인
  - Master plan 찾기 (00-master-plan.md 또는 *master*.md)
  - Phase 문서 개수 확인

output:
  success: "✅ {N}개 phase 발견: {plan-dir}"
  failure: "❌ Master plan을 찾을 수 없음"
```

## Step 2: phase-status.yaml 생성

`.claude/docs/phase-status.yaml` 파일 생성:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionRoot: "docs/implementation/execution"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

## Step 3: Execution Bridge 아티팩트 시드

각 phase마다 아래를 준비합니다.
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`

규칙:
- `SPRINT_CONTRACT.md`는 phase 제목과 문서 경로를 바탕으로 초기 생성
- `QA_REPORT.md`, `HANDOFF.md`는 실행 중 갱신될 placeholder로 시작
- 이미 작업 내용이 있는 파일은 덮어쓰지 않음

## Step 4: Plan Review (선택적)

`--autonomous` 플래그가 **없을 때**만 실행:

```yaml
actions:
  1. 각 phase 문서 로드
  2. /moonshot-detect-uncertainty 호출
  3. 불확실성 발견 시:
     - 질문 표시
     - 사용자 답변 대기
     - phase 문서 업데이트
  4. planConfirmed: true 설정
```

`--autonomous` 플래그가 **있을 때**:
- Q&A 스킵
- 모든 phase를 planConfirmed: true로 설정
- 자율 판단 모드로 진행

## Step 5: 실행 명령어 출력

**최종 출력 형식:**

```
═══════════════════════════════════════════════════════════════
  ✅ 준비 완료
═══════════════════════════════════════════════════════════════

📋 Plan: docs/implementation/00-master-plan.md
📦 Phases: 5개
🤖 Mode: Autonomous

───────────────────────────────────────────────────────────────
  다음 명령어를 별도 터미널에서 실행하세요:
───────────────────────────────────────────────────────────────

  .claude/scripts/agent-loop.sh docs/implementation/ --execution-root docs/implementation/execution

───────────────────────────────────────────────────────────────

💡 Tip: 실행 후 로그는 .claude/logs/agent-loop/ 에서 확인
```

## Step 6: 핸드오프 요약 반환

오케스트레이터용 구조화 요약을 반환:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: delegated-terminal
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  executionCommand: ".claude/scripts/agent-loop.sh docs/implementation/ --execution-root docs/implementation/execution"
  pendingPhases: 5
```

`executionMode: delegated-terminal`은 이 스킬이 실제 phase 구현을 직접 수행하지 않음을 의미합니다.

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionRoot: "docs/implementation/execution"
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core UI"
    status: pending
    planConfirmed: true
```

## References

- `/moonshot-orchestrator`: Phase 구현 위임
- `/moonshot-detect-uncertainty`: 사전 불확실성 감지
- `.claude/scripts/agent-loop.sh`: 자율 실행 루프 (사용자가 별도 실행)

## 오케스트레이터 연동 계약

`/moonshot-orchestrator`에서 호출될 때:
1. 계획 상태를 준비하고 `.claude/docs/phase-status.yaml`을 작성합니다.
2. phase별 execution bridge 아티팩트를 없으면 생성합니다.
3. `phaseRunnerResult` 요약만 반환합니다(phase 문서 본문 인라인 금지).
4. 여기서 구현 완료로 처리하지 않습니다.
5. 외부 phase 실행 결과가 `phase-status.yaml`과 execution bridge 아티팩트에 반영된 뒤에만 오케스트레이터가 완료 검증을 재개합니다.
