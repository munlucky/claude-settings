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
    ├─ 3. Plan Review (--autonomous 미지정 시)
    │      └─ 불확실성 감지 → Q&A → planConfirmed: true
    │
    └─ 4. 실행 명령어 출력
           └─ 사용자가 복사해서 실행
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
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

## Step 3: Plan Review (선택적)

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

## Step 4: 실행 명령어 출력

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

  .claude/scripts/agent-loop.sh docs/implementation/

───────────────────────────────────────────────────────────────

💡 Tip: 실행 후 로그는 .claude/logs/agent-loop/ 에서 확인
```

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
  - number: 2
    title: "Core UI"
    status: pending
    planConfirmed: true
```

## References

- `/moonshot-orchestrator`: Phase 구현 위임
- `/moonshot-detect-uncertainty`: 사전 불확실성 감지
- `.claude/scripts/agent-loop.sh`: 자율 실행 루프 (사용자가 별도 실행)
