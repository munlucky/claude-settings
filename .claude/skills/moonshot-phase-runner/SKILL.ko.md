---
name: moonshot-phase-runner
description: 마스터 플랜 기반 페이즈별 구현 자동화 + 에이전트 루프
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Phase Workflow Runner

## 역할

마스터 플랜 문서 기반으로 페이즈별 구현을 자동화합니다.
계획 검토(Q&A)와 무감독 실행 루프를 통합합니다.

## 사용법

```bash
# 플랜 디렉토리 지정하여 실행
/moonshot-phase-runner docs/implementation/

# 인자 없이 실행 (디렉토리 물어봄)
/moonshot-phase-runner
```

## 워크플로우

```
/moonshot-phase-runner <plan-dir>
    │
    ├─ 1. 플랜 디렉토리 검증
    │      └─ 마스터 플랜 + 페이즈 문서 존재 확인
    │
    ├─ 2. 계획 검토 (Q&A)
    │      └─ 각 페이즈: 불명확 항목 탐지 → 사용자 질문 → 확정
    │
    └─ 3. 루프 실행
           └─ agent-loop.sh가 워커 세션으로 각 페이즈 실행
           └─ 상태 실시간 출력
```

## 1단계: 플랜 디렉토리

```yaml
input:
  provided: 제공된 경로 사용
  not_provided: 사용자에게 물어봄

validation:
  - 디렉토리 존재 확인
  - 마스터 플랜 찾기 (00-master-plan.md 또는 *master*.md)
  - 페이즈 문서 개수 확인

output:
  success: "{plan-dir}에서 {N}개 페이즈 발견"
  failure: "마스터 플랜을 찾을 수 없음"
```

## 2단계: 계획 검토

각 페이즈에 대해:

```yaml
actions:
  1. 페이즈 문서 로드
  2. /moonshot-detect-uncertainty 실행
  3. 불명확 항목 발견 시:
     - 사용자에게 질문 표시
     - 답변 대기
     - 답변을 페이즈 문서에 반영
  4. phase-status.yaml에 planConfirmed: true 마킹
```

**출력:**
```markdown
## Phase 1 검토

✅ 불명확 항목 없음 - 확정됨

## Phase 2 검토

⚠️ 불명확 항목 발견:
1. API 응답 형식이 { data: [] } 인가요 { items: [] } 인가요?

> 답변 대기중...
```

## 3단계: 루프 실행

모든 페이즈 확정 후:

```bash
# agent-loop.sh 포그라운드 실행
.claude/scripts/agent-loop.sh "$PLAN_DIR"
```

**실시간 출력:**
```
═══════════════════════════════════════════════════════════════
  Agent Loop Started
═══════════════════════════════════════════════════════════════

ℹ️ Plan directory: docs/implementation/
ℹ️ Total phases: 5

───────────────────────────────────────────────────────────────
📦 Phase 1: Project Setup
✅ Phase 1 completed (45s)

───────────────────────────────────────────────────────────────
📦 Phase 2: Core UI
✅ Phase 2 completed (120s)

───────────────────────────────────────────────────────────────
📦 Phase 3: File & Git Integration
❌ Phase 3 failed

⚠️ 다음 페이즈로 계속할까요? (y/n)
```

## 상태 파일

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
phases:
  - number: 1
    title: "Project Setup"
    status: completed
    planConfirmed: true
    completedAt: "2026-02-06T14:00:00Z"
  - number: 2
    title: "Core UI"
    status: in_progress
    planConfirmed: true
```

## 에러 처리

```yaml
buildFailed:
  action: 에러 표시, 계속 또는 중단 선택

phaseDocMissing:
  action: 경고와 함께 스킵

userCancel:
  action: 루프 정상 종료
```

## 참조

- `/moonshot-orchestrator`: 페이즈별 구현 위임
- `/moonshot-detect-uncertainty`: 실행 전 불명확 항목 탐지
- `/commit-moonshot`: 프로젝트 메모리 + git 커밋 자동화
- `.claude/scripts/agent-loop.sh`: 워커 세션 생성기
