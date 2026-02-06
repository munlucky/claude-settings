---
name: moonshot-agent-loop
description: Unattended agent loop execution. Automatically finds and executes the next task.
triggers:
  - "agent loop"
  - "run agent"
  - "moonshot loop"
---

# Agent Loop Skill

## Role

사용자 개입 없이 자동으로 다음 태스크를 찾아 실행하는 무감독 에이전트 모드입니다.

## 사용법

```bash
/agent-loop                    # 다음 태스크 1개 실행
/agent-loop --iterations 5     # 5개 태스크 연속 실행
/agent-loop --until-blocked    # 막힐 때까지 계속 실행
/agent-loop --status           # 현재 상태만 확인
```

## Workflow

### 1. 상태 확인

```bash
# 1.1 phase-status.yaml 확인
cat .claude/docs/phase-status.yaml 2>/dev/null || echo "phase-status not found"

# 1.2 master-plan 확인
cat docs/implementation/00-master-plan.md 2>/dev/null || echo "master-plan not found"

# 1.3 task-registry 확인
cat .claude/docs/task-registry.yaml 2>/dev/null || echo "task-registry not found"
```

**태스크 소스 우선순위:**
1. `phase-status.yaml` - moonshot-phase-runner 기반 프로젝트
2. `00-master-plan.md` - 체크리스트 기반 프로젝트
3. `task-registry.yaml` - 병렬 에이전트용 태스크 목록
4. Git diff / TODO 주석 - 폴백

### 2. 다음 태스크 결정

```yaml
taskSelection:
  # Phase 기반
  fromPhaseStatus:
    - Find first phase with status != "completed"
    - Extract phase document path
    
  # Master plan 기반
  fromMasterPlan:
    - Parse checklist items
    - Find first `- [ ]` item
    
  # Task registry 기반
  fromTaskRegistry:
    - Find task with status: "available"
    - Acquire lock before proceeding
```

### 3. Lock 획득 (병렬 모드)

```bash
# Lock 디렉토리 생성
mkdir -p .claude/current_tasks

# Lock 파일 생성 시도
TASK_NAME="task-name-here"
LOCK_FILE=".claude/current_tasks/${TASK_NAME}.lock"

if [ ! -f "$LOCK_FILE" ]; then
  echo "agent_id: $(uuidgen)" > "$LOCK_FILE"
  echo "started_at: $(date -Iseconds)" >> "$LOCK_FILE"
  echo "Lock acquired: $TASK_NAME"
else
  echo "Task already locked, finding another..."
  # 다른 태스크 선택
fi
```

### 4. 태스크 실행

선택된 태스크 유형에 따라 적절한 스킬/에이전트 호출:

| 태스크 유형 | 호출 대상 |
|------------|----------|
| Phase 구현 | `/moonshot-orchestrator` |
| 단일 기능 | `/implementation-runner` |
| 버그 수정 | 직접 수정 후 `/completion-verifier` |
| 리팩토링 | 직접 수정 후 `/codex-review-code` |

**실행 템플릿:**
```markdown
## 현재 태스크: {task_name}

다음 태스크를 실행합니다:
- 소스: {source} (phase-status / master-plan / task-registry)
- 설명: {task_description}

[실행 시작]
```

### 5. 완료 처리

```yaml
onSuccess:
  - Update source (phase-status / master-plan / task-registry)
  - Release lock
  - Commit changes: `/commit-moonshot "{task_name} 완료"`
  - Log to `.claude/logs/agent-loop.log`

onFailure:
  - Document blocker in `.claude/docs/blockers.md`
  - Release lock
  - If --until-blocked: stop loop
  - Else: try next task
```

### 6. 루프 계속 여부 결정

```yaml
continueLoop:
  # 중단 조건
  stopIf:
    - iterations >= maxIterations
    - allTasksCompleted
    - criticalError
    - userRequestedStop (Ctrl+C)
    
  # 계속 조건  
  continueIf:
    - remainingTasks > 0
    - noBlockers OR --until-blocked not set
```

## 출력 형식

### 시작 시
```markdown
## 🤖 Agent Loop 시작

| 설정 | 값 |
|------|------|
| 모드 | {iterations / until-blocked} |
| 남은 태스크 | {count} |
| Lock 상태 | {acquired / none} |

다음 태스크: {task_name}
```

### 태스크 완료 시
```markdown
## ✅ 태스크 완료: {task_name}

- 소요 시간: {duration}
- 변경 파일: {file_count}개
- 커밋: {commit_hash}

다음 태스크로 이동...
```

### 루프 종료 시
```markdown
## 🏁 Agent Loop 완료

| 항목 | 값 |
|------|------|
| 실행 태스크 | {completed_count} |
| 성공 | {success_count} |
| 실패/차단 | {blocked_count} |

{blockers가 있으면 목록 출력}
```

## Error Handling

```yaml
errors:
  noTasksFound:
    message: "실행할 태스크가 없습니다"
    action: 
      - Check if all tasks completed
      - Or ask user for new tasks
      
  lockConflict:
    message: "다른 에이전트가 작업 중입니다"
    action:
      - Try another task
      - Or wait and retry
      
  implementationFailed:
    message: "구현 중 오류 발생"
    action:
      - Document in blockers.md
      - Move to next task
      - Max 2 retries per task
```

## Blockers 문서 형식

```markdown
# .claude/docs/blockers.md

## [2026-02-06] Phase 3 - File watcher 구현 실패

**Phase**: 3
**태스크**: File system watcher 구현
**문제**: 
- Node.js fs.watch가 macOS에서 불안정
- chokidar 대안 검토 필요

**시도한 해결책**:
1. fs.watch 직접 사용 → 이벤트 중복 발생
2. debounce 적용 → 부분 해결

**필요한 것**:
- chokidar 의존성 추가 승인
- 또는 polling 방식으로 변경
```

## References

- `/moonshot-phase-runner`: Phase 기반 실행
- `/moonshot-orchestrator`: 태스크 분석 및 체인 구성
- `/parallel-agent-coordination` workflow: 병렬 에이전트 조정
