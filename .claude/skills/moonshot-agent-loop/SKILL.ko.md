---
name: moonshot-agent-loop
description: 무감독 에이전트 루프 실행. 자동으로 다음 태스크를 찾아 실행합니다.
triggers:
  - "agent loop"
  - "run agent"
  - "moonshot loop"
---

# 에이전트 루프 스킬

## 역할

사용자 개입 없이 자동으로 다음 태스크를 찾아 실행하는 무감독 에이전트 모드입니다.

## 사용법

```bash
/agent-loop                    # 다음 태스크 1개 실행
/agent-loop --iterations 5     # 5개 태스크 연속 실행
/agent-loop --until-blocked    # 막힐 때까지 계속 실행
/agent-loop --status           # 현재 상태만 확인
```

## 워크플로우

### 1. 상태 확인

```bash
# 1.1 phase-status.yaml 확인
cat .claude/docs/phase-status.yaml 2>/dev/null || echo "phase-status 없음"

# 1.2 master-plan 확인
cat docs/implementation/00-master-plan.md 2>/dev/null || echo "master-plan 없음"

# 1.3 task-registry 확인
cat .claude/docs/task-registry.yaml 2>/dev/null || echo "task-registry 없음"
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
    - status != "completed"인 첫 번째 phase 찾기
    - phase 문서 경로 추출
    
  # Master plan 기반
  fromMasterPlan:
    - 체크리스트 항목 파싱
    - 첫 번째 `- [ ]` 항목 찾기
    
  # Task registry 기반
  fromTaskRegistry:
    - status: "available"인 태스크 찾기
    - 진행 전 lock 획득
```

### 3. Lock 획득 (병렬 모드)

```bash
# Lock 디렉토리 생성
mkdir -p .claude/current_tasks

# Lock 파일 생성 시도
TASK_NAME="태스크명"
LOCK_FILE=".claude/current_tasks/${TASK_NAME}.lock"

if [ ! -f "$LOCK_FILE" ]; then
  echo "agent_id: $(uuidgen)" > "$LOCK_FILE"
  echo "started_at: $(date -Iseconds)" >> "$LOCK_FILE"
  echo "Lock 획득: $TASK_NAME"
else
  echo "이미 잠긴 태스크, 다른 것 찾는 중..."
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

### 5. 완료 처리

```yaml
onSuccess:
  - 소스 업데이트 (phase-status / master-plan / task-registry)
  - Lock 해제
  - 변경사항 커밋: `/commit-moonshot "{task_name} 완료"`
  - `.claude/logs/agent-loop.log`에 로그

onFailure:
  - `.claude/docs/blockers.md`에 문서화
  - Lock 해제
  - --until-blocked인 경우: 루프 중단
  - 아니면: 다음 태스크 시도
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
    - noBlockers OR --until-blocked 미설정
```

## 출력 형식

### 시작 시
```markdown
## 🤖 Agent Loop 시작

| 설정 | 값 |
|------|------|
| 모드 | {iterations / until-blocked} |
| 남은 태스크 | {count} |

다음 태스크: {task_name}
```

### 루프 종료 시
```markdown
## 🏁 Agent Loop 완료

| 항목 | 값 |
|------|------|
| 실행 태스크 | {completed_count} |
| 성공 | {success_count} |
| 실패/차단 | {blocked_count} |
```

## 에러 처리

```yaml
errors:
  noTasksFound:
    message: "실행할 태스크가 없습니다"
    action: 모든 태스크 완료 확인 또는 사용자에게 새 태스크 요청
      
  lockConflict:
    message: "다른 에이전트가 작업 중입니다"
    action: 다른 태스크 시도 또는 대기 후 재시도
      
  implementationFailed:
    message: "구현 중 오류 발생"
    action: blockers.md에 문서화 후 다음 태스크로 이동 (태스크당 최대 2회 재시도)
```

## 참조

- `/moonshot-phase-runner`: Phase 기반 실행
- `/moonshot-orchestrator`: 태스크 분석 및 체인 구성
- `/parallel-agent-coordination` 워크플로우: 병렬 에이전트 조정
