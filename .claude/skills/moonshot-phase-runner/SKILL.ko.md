---
name: moonshot-phase-runner
description: 마스터 플랜 기반 페이즈별 구현 자동화
triggers:
  - "phase runner"
  - "마스터 플랜 실행"
  - "페이즈 구현"
---

# Phase Workflow Runner

## 역할

마스터 플랜(`docs/implementation/00-master-plan.md`)을 기반으로 페이즈 단위 구현 워크플로우를 자동화합니다.
각 페이즈는 `/moonshot-orchestrator` 스킬을 통해 실행되며, 페이즈 간 컨텍스트 격리를 위해 `/clear` 사용을 권장합니다.

## 입력 파싱

| 인자 | 설명 |
|------|------|
| `next` | 다음 미완료 페이즈 1개 실행 |
| `all` | 모든 미완료 페이즈 연속 실행 |
| `status` | 현재 상태만 출력 |
| `N` (숫자) | 특정 페이즈 실행 (예: `4`) |
| `--dry-run` | 실제 실행 없이 계획만 출력 |
| `--skip-commit` | 커밋 단계 건너뛰기 |

## 워크플로우

### 1. 상태 확인

#### 1.1 마스터 플랜 파싱

`docs/implementation/00-master-plan.md` 파일을 읽고 체크리스트 상태를 파싱합니다.

**파싱 규칙:**
```
### Phase N: {제목} ✅     → status: completed
### Phase N: {제목}        → 아래 체크리스트 확인
- [x] N.N 항목             → 완료된 항목
- [ ] N.N 항목             → 미완료 항목
```

**페이즈 상태 판정:**
- 모든 항목이 `[x]` → `completed`
- 일부만 `[x]` → `in_progress`
- 모두 `[ ]` → `pending`

#### 1.2 페이즈 문서 매핑

마스터 플랜에서 각 페이즈의 문서 경로를 추출합니다:
```yaml
phaseDocuments:
  1: "docs/implementation/01-*.md"
  2: "docs/implementation/02-*.md"
  # ... 패턴 매칭으로 자동 탐지
```

#### 1.3 상태 파일 관리

**파일 위치:** `.claude/docs/phase-status.yaml`

첫 실행 시 자동 생성:
```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
lastUpdated: "{timestamp}"
phases:
  - number: 1
    title: "{마스터플랜에서 추출}"
    document: "docs/implementation/01-*.md"
    status: pending  # pending | in_progress | completed | failed
    completedAt: null
    commitHash: null
    notes: []
currentPhase: null
totalPhases: 9
executionLog: []
```

### 2. 사용자 확인

실행 전 상태 테이블을 출력합니다:

```markdown
## Phase Workflow Runner

**마스터 플랜:** docs/implementation/00-master-plan.md

| Phase | 제목 | 상태 |
|-------|------|------|
| 1 | 프로젝트 구조 및 Tauri 설정 | ✅ 완료 |
| 2 | 핵심 UI 레이아웃 구축 | ✅ 완료 |
| 3 | 파일 & Git 통합 | ⏳ 진행중 |
| 4 | AI 스킬 시스템 구현 | ⬜ 대기 |
...

**다음 실행 대상:** Phase 3 - 파일 & Git 통합

계속 진행하시겠습니까? (Y/n)
```

`--dry-run` 옵션 시 여기서 종료.

### 3. 페이즈 구현

#### 3.1 페이즈 문서 로드

해당 페이즈의 문서를 전체 읽습니다.

#### 3.2 Orchestrator 호출

`/moonshot-orchestrator` 스킬을 호출하여 페이즈 구현을 위임합니다:

```markdown
**Phase {N} 구현 요청**

다음 페이즈 문서의 모든 작업을 구현해주세요:

---
{페이즈 문서 전체 내용}
---

**완료 조건:**
- 모든 체크리스트 항목 구현
- 빌드 성공
- 기본 동작 검증
```

#### 3.3 결과 확인

Orchestrator 실행 후:
- 빌드 상태 확인 (`npm run build` 또는 프로젝트별 빌드 명령)
- 기본 테스트 통과 여부 확인
- 실패 시 `build-error-resolver` 자동 주입 (Orchestrator 내부 처리)

### 4. 커밋 및 상태 업데이트

#### 4.1 커밋 실행

`--skip-commit` 옵션이 아니면 `/commit-moonshot` 스킬을 호출합니다:

```bash
/commit-moonshot "Phase {N}: {페이즈 제목} 구현 완료"
```

#### 4.2 상태 파일 업데이트

`.claude/docs/phase-status.yaml` 업데이트:
```yaml
phases:
  - number: {N}
    status: completed
    completedAt: "{ISO timestamp}"
    commitHash: "{git commit hash}"
executionLog:
  - timestamp: "{ISO timestamp}"
    phase: {N}
    action: "completed"
    commitHash: "{hash}"
```

#### 4.3 마스터 플랜 동기화

**필수:** 상태 파일과 마스터 플랜 간 일관성 유지

1. 해당 페이즈의 모든 체크리스트를 `[x]`로 변경
2. 페이즈 제목에 `✅` 마크 추가 (아직 없으면)
3. 파일 저장

### 5. 다음 페이즈 (반복)

#### `next` 모드
- 현재 페이즈 완료 후 결과 요약 출력
- 종료

#### `all` 모드
1. 다음 pending/in_progress 페이즈 확인
2. 없으면 완료 메시지 출력 후 종료
3. 있으면 **사용자에게 `/clear` 후 계속 실행할지 확인**:

```markdown
## Phase {N} 완료!

**다음 페이즈:** Phase {N+1} - {제목}

> [!TIP]
> 컨텍스트 최적화를 위해 `/clear` 후 다시 `/phase-workflow-runner next`를 실행하는 것을 권장합니다.

계속 진행하시겠습니까?
- `Y`: 현재 컨텍스트에서 계속
- `clear`: `/clear` 후 자동 재실행
- `n`: 중단
```

**전체 완료 출력:**
```markdown
## 🎉 전체 워크플로우 완료!

| 항목 | 값 |
|------|-----|
| 실행된 페이즈 | 4개 |
| 총 커밋 | 4개 |
| 소요 시간 | ~2시간 |

모든 페이즈가 성공적으로 완료되었습니다!
```

## 에러 처리

### 빌드/테스트 실패

```yaml
buildFailed:
  action:
    - Orchestrator 내부 build-error-resolver 자동 실행
    - 최대 2회 재시도
  fallback:
    - 실패 로그를 phase-status.yaml에 기록
    - status를 "failed"로 설정
    - 사용자에게 보고하고 중단
```

### 커밋 충돌

```yaml
commitConflict:
  action:
    - Git 상태 확인
    - 충돌 파일 목록 출력
    - 사용자에게 수동 해결 요청
  note: 페이즈 구현은 완료로 기록 (커밋만 대기)
```

### 페이즈 문서 없음

```yaml
documentMissing:
  action:
    - 경고 출력
    - 사용자에게 문서 경로 확인 요청
    - 해당 페이즈 건너뛰기 옵션 제공
```

## 사용 예시

```bash
# 현재 상태 확인
/phase-workflow-runner status

# 다음 미완료 페이즈 1개 실행
/phase-workflow-runner next

# 특정 페이즈 실행
/phase-workflow-runner 4

# 모든 미완료 페이즈 연속 실행
/phase-workflow-runner all

# 드라이런 (계획만 확인)
/phase-workflow-runner next --dry-run

# 커밋 없이 실행
/phase-workflow-runner next --skip-commit
```

## 참조

- `/moonshot-orchestrator`: 페이즈별 구현 위임
- `/commit-moonshot`: 프로젝트 메모리 + 커밋 자동화
- `.claude/docs/guidelines/document-memory-policy.md`: 문서 토큰 관리 정책
