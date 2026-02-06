---
description: 여러 에이전트가 같은 프로젝트에서 병렬 작업 시 충돌 방지
---

# Parallel Agent Coordination

같은 코드베이스에서 여러 Claude 에이전트가 동시에 작업할 때 충돌을 방지하는 방법입니다.

## 핵심 원칙

1. **flock 기반 Lock**: 파일 시스템 레벨 잠금
2. **태스크 분리**: 각 에이전트가 다른 영역 담당
3. **머지 충돌 최소화**: 동일 파일 동시 수정 회피

## Lock 메커니즘

### Lock 디렉토리 구조

```
.claude/current_tasks/
├── phase-3-implementation.lock
├── docs-update.lock
└── test-fixes.lock
```

### Lock 획득 (Bash)

```bash
# 1. Lock 파일 생성
TASK_NAME="my-task"
LOCK_FILE=".claude/current_tasks/${TASK_NAME}.lock"

# 2. flock으로 잠금 시도
exec 200>"$LOCK_FILE"
if flock -n 200; then
    echo "Lock acquired!"
    echo "agent_id: $$" > "$LOCK_FILE"
    echo "started_at: $(date -Iseconds)" >> "$LOCK_FILE"
else
    echo "Task already locked by another agent"
    exit 1
fi

# 3. 작업 수행...

# 4. 완료 후 Lock 해제
rm -f "$LOCK_FILE"
```

### Lock 파일 내용

```yaml
agent_id: "12345"
started_at: "2026-02-06T10:00:00+09:00"
task_description: "Phase 3 UI implementation"
estimated_completion: "30min"
```

## 태스크 레지스트리

### 파일: `.claude/docs/task-registry.yaml`

```yaml
schemaVersion: "1.0"
lastUpdated: "2026-02-06T10:00:00Z"

tasks:
  - id: phase-3
    description: "UI component implementation"
    status: in_progress
    locked_by: agent-1
    files:
      - "src/components/**"
      - "src/styles/**"
      
  - id: phase-4
    description: "API integration"
    status: available
    locked_by: null
    files:
      - "src/api/**"
      - "src/hooks/**"
      
  - id: docs-update
    description: "Documentation sync"
    status: available
    locked_by: null
    files:
      - "docs/**"
      - "README.md"
```

## 충돌 방지 전략

### 방법 1: Phase 분리 (권장)

```
Agent A: Phase 3 (UI) ──────┐
                            ├── 완전 분리, 충돌 없음
Agent B: Phase 4 (API) ─────┘
```

### 방법 2: 파일 영역 분리

```
Agent A: src/components/   ──┐
                             ├── 다른 디렉토리, 충돌 최소
Agent B: src/api/          ──┘
```

### 방법 3: 순차 실행 (안전)

```
Agent A 완료 ──> Commit ──> Agent B 시작
```

## 머지 충돌 발생 시

### 자동 해결 시도

```bash
# git pull 시 충돌 발생하면
git pull --rebase

# rebase 충돌 시 - theirs 전략 (상대방 변경 수용)
git checkout --theirs <file>
git add <file>
git rebase --continue
```

### 수동 해결 필요 시

1. `.claude/docs/blockers.md`에 기록
2. Lock 해제
3. 다른 태스크로 이동
4. 사용자에게 알림

## 모니터링

### 현재 Lock 상태 확인

```bash
# // turbo
ls -la .claude/current_tasks/
```

### 모든 Lock 강제 해제

```bash
rm .claude/current_tasks/*.lock
```

### 태스크 현황 조회

```bash
cat .claude/docs/task-registry.yaml
```
