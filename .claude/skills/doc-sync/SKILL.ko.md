---
name: doc-sync
description: Synchronizes documentation across agents to reflect planning changes and status updates.
---

# Doc Sync Skill

> **목적**: 에이전트 간 문서 동기화를 자동화하여 계획 변경사항, 진행 상황, 미해결 질문을 실시간 반영
> **사용 시점**: Codex Validator 완료 후, Requirements Completion Check 후, Documentation Finalize 전
> **출력**: `{tasksRoot}/{feature-name}/context.md`, `pending-questions.md`, `flow-report.md`

---

## 🎯 목표

### 문제점
- **기존 시스템**: 문서 업데이트가 Documentation Agent에서만 수행
- **중간 단계 문서 동기화 부재**: Validator가 계획을 수정해도 즉시 반영 안 됨
- **피드백 루프 지연**: Implementation Agent가 구버전 context.md 참조

### 해결 방안
- Codex Validator 완료 후 즉시 context.md 업데이트
- 실시간 진행 상황 추적 (flow-report.md)
- 미해결 질문 중앙화 관리 (pending-questions.md)

---

## 📝 자동 트리거 시점

### 1. Codex Validator 완료 후
- Validator가 생성한 auto_apply 항목을 context.md에 자동 반영
- 새로운 권장사항을 pending-questions.md에 추가
- flow-report.md에 "Planning 완료" 표시

### 2. Requirements Completion Check 후
- 미완료 항목을 pending-questions.md에 추가
- flow-report.md에 "Implementation 재실행" 기록

### 3. Documentation Finalize 전
- 최종 동기화 (모든 문서 최신 상태 확인)
- pending-questions.md 비우기 또는 "Resolved" 표시
- flow-report.md 완료 표시

---

## 🔧 입력 형식

### YAML 형식 (권장)

```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: Phase 1
    action: append
    content: "날짜 입력 검증 강화: 과거 30일 제한 추가"
  - file: pending-questions.md
    action: add_question
    priority: MEDIUM
    content: "에러 메시지를 Toast로 변경할까요?"
    context: "사용자 경험 개선"
  - file: flow-report.md
    action: update_phase
    phase: Planning
    status: completed
```

### 수동 트리거 (사용자가 직접 호출)

```
doc-sync 시작: batch-management
  - context.md: Phase 1 수정
  - pending-questions.md: 1개 추가
  - flow-report.md: Planning 완료
```

---

## 📋 지원 파일 및 액션

### 1. context.md

#### 액션: `append` (섹션 끝에 추가)
```yaml
file: context.md
section: Phase 1
action: append
content: "날짜 입력 검증 강화: 과거 30일 제한 추가"
```

**결과**:
```markdown
## Phase 1: Mock 기반 UI (1시간)
1. 타입 정의 (15분)
2. Mock 데이터 (10분)
...

### Validator 피드백 (2025-12-20 추가)
- 날짜 입력 검증 강화: 과거 30일 제한 추가
```

#### 액션: `update` (특정 내용 수정)
```yaml
file: context.md
section: "위험 및 대안"
action: update
old_content: "확률: Medium"
new_content: "확률: Low (API 스펙 확정 완료)"
```

#### 액션: `prepend` (섹션 앞에 추가)
```yaml
file: context.md
section: "변경 대상 파일"
action: prepend
content: "⚠️  Validator 권장사항 반영됨 (2025-12-20)"
```

---

### 2. pending-questions.md

#### 액션: `add_question` (질문 추가)
```yaml
file: pending-questions.md
action: add_question
priority: HIGH
content: "과거 날짜 허용 범위는 어디까지인가요?"
context: "Validator 피드백: 과거 30일 제한 권장"
options:
  - 30일
  - 60일
  - 90일
  - 무제한
```

**결과**:
```markdown
## 미해결 질문

### [HIGH] 과거 날짜 허용 범위는 어디까지인가요?
- **발견 시각**: 2025-12-20 09:25
- **컨텍스트**: Validator 피드백: 과거 30일 제한 권장
- **옵션**:
  - 30일
  - 60일
  - 90일
  - 무제한
- **상태**: 대기 중
```

#### 액션: `resolve_question` (질문 해결)
```yaml
file: pending-questions.md
action: resolve_question
question_id: 1
resolution: "30일로 결정"
resolved_at: "2025-12-20 09:30"
```

**결과**:
```markdown
### [HIGH] ~~과거 날짜 허용 범위는 어디까지인가요?~~ (해결됨)
- **결론**: 30일로 결정
- **해결 시각**: 2025-12-20 09:30
```

#### 액션: `clear` (모든 질문 제거 - Finalize 시)
```yaml
file: pending-questions.md
action: clear
archive: true
```

---

### 3. flow-report.md

#### 액션: `update_phase` (Phase 상태 업데이트)
```yaml
file: flow-report.md
action: update_phase
phase: Planning
status: completed
timestamp: "2025-12-20 09:25"
```

**결과**:
```markdown
| Phase | 상태 | 시작 시각 | 완료 시각 |
|-------|------|----------|----------|
| Planning | ✅ 완료 | 09:00 | 09:25 |
| Implementation | 🔄 진행 중 | 09:30 | - |
```

#### 액션: `add_event` (이벤트 추가)
```yaml
file: flow-report.md
action: add_event
event: "Validator 피드백 반영"
description: "context.md에 날짜 검증 강화 추가"
timestamp: "2025-12-20 09:25"
```

**결과**:
```markdown
## 주요 이벤트

- [09:25] **Validator 피드백 반영**: context.md에 날짜 검증 강화 추가
```

---

## 📊 출력 형식

### 성공 시
```markdown
✅ Doc Sync 완료

## 업데이트 파일
- context.md: Phase 1 섹션에 Validator 피드백 추가
- pending-questions.md: 1개 질문 추가 (HIGH)
- flow-report.md: Planning 완료 표시

## 변경 요약
- Validator 피드백: 날짜 입력 검증 강화 (과거 30일 제한)
- 새로운 질문: 과거 날짜 허용 범위 결정 필요
- Planning Phase 완료 (소요 시간: 25분)

## 다음 단계
- Implementation Agent 재확인 (최신 context.md 반영)
- pending-questions 답변 대기 (HIGH 1개)
```

### 오류 시
```markdown
❌ Doc Sync 실패

## 오류 내역
- context.md: 섹션 "Phase 1" 찾을 수 없음
- pending-questions.md: 업데이트 성공 ✅
- flow-report.md: 파일 없음 (생성 필요)

## 조치 필요
- context.md의 섹션 구조 확인
- flow-report.md 수동 생성

## 부분 성공
1/3 파일 업데이트 완료
```

---

## 🔗 연계 에이전트/스킬

### 입력 (사용하는 정보)
- **Codex Validator**: auto_apply, user_confirm 항목
- **Moonshot Agent (Completion Check)**: incomplete_items 리스트
- **Documentation Agent**: 최종 동기화 요청

### 출력 (제공하는 정보)
- **Implementation Agent**: 최신 context.md
- **Moonshot Agent**: pending-questions 개수, flow-report 상태
- **Documentation Agent**: 모든 문서 최신화 완료 확인

---

## 📦 파일 구조

### 문서 경로
```
{tasksRoot}/{feature-name}/
├── context.md              # 구현 계획 (실시간 업데이트)
├── pending-questions.md    # 미해결 질문 (실시간 업데이트)
└── flow-report.md         # Phase별 진행 상황 (실시간 업데이트)
```

### 아카이브 (선택적)
```
{tasksRoot}/{feature-name}/archives/
├── context-v1.md          # Validator 피드백 전
├── context-v2.md          # Validator 피드백 후
└── pending-questions-resolved.md  # 해결된 질문들
```

---

## 🎨 사용 시나리오

### 시나리오 1: Codex Validator 피드백 자동 반영

**Validator 출력**:
```yaml
status: pass_with_changes
auto_apply:
  - priority: HIGH
    target: context.md
    section: Phase 1
    content: "날짜 입력 검증 강화: 과거 30일 제한 추가"
user_confirm:
  - priority: MEDIUM
    content: "에러 메시지를 Toast로 변경 권장"
```

**Doc Sync 실행**:
```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: Phase 1
    action: append
    content: "### Validator 피드백 (HIGH)\n- 날짜 입력 검증 강화: 과거 30일 제한 추가"
  - file: pending-questions.md
    action: add_question
    priority: MEDIUM
    content: "에러 메시지를 Toast로 변경할까요?"
    context: "Validator 권장사항"
  - file: flow-report.md
    action: add_event
    event: "Validator 피드백 반영"
    description: "context.md 업데이트 + pending-questions 1개 추가"
```

**결과**:
- Implementation Agent는 최신 context.md 읽어서 날짜 검증 코드 추가
- 사용자는 pending-questions에서 Toast 변경 여부 답변

---

### 시나리오 2: Requirements Completion Check 후 재실행

**Moonshot Agent Completion Check 결과**:
```yaml
status: incomplete
incomplete_items:
  - "에러 처리 Alert 추가"
  - "메뉴/권한 설정"
```

**Doc Sync 실행**:
```yaml
feature_name: batch-management
updates:
  - file: pending-questions.md
    action: add_question
    priority: HIGH
    content: "에러 처리 Alert 구현 필요"
    context: "Requirements Completion Check: 사전 합의서 미완료 항목"
  - file: pending-questions.md
    action: add_question
    priority: HIGH
    content: "메뉴/권한 설정 필요"
    context: "context.md Phase 3 체크포인트 미완료"
  - file: flow-report.md
    action: update_phase
    phase: Implementation
    status: "재실행 필요"
```

**결과**:
- Implementation Agent 재실행 (미완료 항목만)
- flow-report.md에 재실행 이력 기록

---

### 시나리오 3: Documentation Finalize 전 최종 동기화

**Documentation Agent 요청**:
```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: "최종 상태"
    action: append
    content: "- [x] 모든 Phase 완료\n- [x] 검증 통과\n- [x] 문서화 완료"
  - file: pending-questions.md
    action: clear
    archive: true
  - file: flow-report.md
    action: update_phase
    phase: Documentation
    status: completed
```

**결과**:
- pending-questions.md 비우기 (resolved 항목은 archives로 이동)
- flow-report.md 최종 완료 표시
- context.md에 최종 상태 기록

---

## 💡 사용 팁

### 1. 충돌 방지
- 동시 업데이트 감지: 타임스탬프 비교
- 충돌 시 사용자에게 알림 + 수동 해결

### 2. 버전 관리 (선택적)
- 중요한 변경 시 이전 버전 백업
- context-v1.md, context-v2.md 형태로 보관

### 3. 롤백 지원
- 마지막 변경 전 스냅샷 저장
- 문제 발생 시 즉시 복구 가능

### 4. 검증 자동화
- 업데이트 후 파일 구조 검증
- 필수 섹션 누락 체크

---

## 🎯 기대 효과

### 정성적 효과
1. **실시간 피드백 루프**: Validator → Doc Sync → Implementation (즉시 반영)
2. **문서 일관성 보장**: 모든 에이전트가 최신 문서 참조
3. **미해결 질문 중앙화**: pending-questions.md로 통합 관리
4. **진행 상황 투명화**: flow-report.md로 실시간 추적

### 정량적 효과
- **피드백 반영 시간**: 수동 10분 → 자동 즉시 (100% 단축)
- **문서 불일치 오류**: 30% → 0% (완전 제거)
- **재작업 방지**: Validator 피드백 즉시 반영으로 평균 15분 절약

---

## 🔧 구현 세부사항

### Quality Bar
- 기존 내용 유지 (섹션 구조 변경 금지)
- 충돌 방지 (동시 업데이트 감지)
- 원자성 보장 (일부 실패 시 롤백)
- 검증 자동화 (업데이트 후 파일 구조 체크)

### 에러 처리
1. **파일 없음**: 자동 생성 (템플릿 사용)
2. **섹션 없음**: 경고 + 파일 끝에 추가
3. **동시 업데이트 충돌**: 타임스탬프 비교 + 사용자 알림
4. **포맷 오류**: 검증 실패 + 롤백

### 로깅
- 모든 업데이트를 flow-report.md에 자동 기록
- 타임스탬프, 변경 파일, 변경 내용 포함
- 오류 발생 시 상세 로그 저장

---

**이 스킬을 활성화하면 모든 문서가 실시간으로 동기화됩니다!**
