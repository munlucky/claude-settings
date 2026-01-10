---
name: moonshot-orchestrator
description: PM 워크플로우 오케스트레이터. 사용자 요청을 분석하고 최적의 에이전트 체인을 자동으로 실행한다.
---

# PM 오케스트레이터

## 역할
PM 분석 스킬들을 순차적으로 실행하고 최종 에이전트 체인을 구성하는 오케스트레이터.

## 입력
다음 정보를 자동으로 수집:
- `userMessage`: 사용자 요청
- `gitBranch`: 현재 브랜치
- `gitStatus`: Git 상태 (clean/dirty)
- `recentCommits`: 최근 커밋 목록
- `openFiles`: 열린 파일 목록

## 워크플로우

### 1. analysisContext 초기화
```yaml
schemaVersion: "1.0"
request:
  userMessage: "{userMessage}"
  taskType: unknown
  keywords: []
repo:
  gitBranch: "{gitBranch}"
  gitStatus: "{gitStatus}"
  openFiles: []
  changedFiles: []
signals:
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  hasMockImplementation: false
  apiSpecConfirmed: false
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: unknown
complexity: unknown
missingInfo: []
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: .claude/context.md
  verificationScript: .claude/agents/verification/verify-changes.sh
notes: []
```

### 2. PM 스킬 순차 실행

#### 2.1 작업 분류
`Skill` 도구를 사용하여 `/moonshot-classify-task` 실행
- 반환된 patch를 analysisContext에 병합
- 예: `request.taskType`, `request.keywords`, `notes` 추가

#### 2.2 복잡도 평가
`Skill` 도구를 사용하여 `/moonshot-evaluate-complexity` 실행
- 반환된 patch를 analysisContext에 병합
- 예: `complexity`, `estimates.*` 업데이트

#### 2.3 불확실성 검출
`Skill` 도구를 사용하여 `/moonshot-detect-uncertainty` 실행
- 반환된 patch를 analysisContext에 병합
- `missingInfo` 배열 확인

#### 2.4 불확실성 처리
`missingInfo`가 비어있지 않으면:
1. `AskUserQuestion` 도구로 질문 생성
   - `missingInfo`의 각 항목을 질문으로 변환
   - priority HIGH 항목 우선
2. 사용자 답변 대기
3. 답변을 analysisContext에 반영:
   - API 관련 답변 → `signals.apiSpecConfirmed = true`
   - 디자인 스펙 답변 → 디자인 파일 경로 저장
   - 기타 답변 → `notes`에 기록
4. `signals.hasPendingQuestions = false` 설정
5. 필요시 `/moonshot-detect-uncertainty` 재실행

`missingInfo`가 비면 다음 단계로 진행.

#### 2.5 시퀀스 결정
`Skill` 도구를 사용하여 `/moonshot-decide-sequence` 실행
- 반환된 patch를 analysisContext에 병합
- `phase`, `decisions.skillChain`, `decisions.parallelGroups` 설정

### 3. 에이전트 체인 실행

`decisions.skillChain`을 순서대로 실행:

**허용된 단계:**
- `pre-flight-check`: 사전 점검 스킬
- `requirements-analyzer`: 요구사항 분석 에이전트 (Task tool)
- `context-builder`: 컨텍스트 구축 에이전트 (Task tool)
- `codex-validate-plan`: Codex 계획 검증 스킬
- `implementation-runner`: 구현 에이전트 (Task tool)
- `codex-review-code`: Codex 코드 리뷰 스킬
- `codex-test-integration`: Codex 통합 테스트 스킬
- `verify-changes.sh`: 검증 스크립트 (Bash tool)
- `efficiency-tracker`: 효율성 추적 스킬
- `session-logger`: 세션 로깅 스킬

**실행 규칙:**
1. 각 단계를 순차적으로 실행
2. 스킬 단계는 `Skill` 도구 사용
3. 에이전트 단계는 `Task` 도구 사용 (subagent_type 매핑)
4. 스크립트 단계는 `Bash` 도구 사용
5. 병렬 그룹이 있으면 해당 그룹 내에서만 병렬 실행
6. 정의되지 않은 단계 발견 시 사용자에게 확인 요청 후 중단

**에이전트 매핑:**
- `requirements-analyzer` → `subagent_type: "general-purpose"` + 프롬프트
- `context-builder` → `subagent_type: "context-builder"`
- `implementation-runner` → `subagent_type: "implementation-agent"`

### 4. 결과 기록
최종 analysisContext를 `.claude/docs/moonshot-analysis.yaml`에 저장.

## 출력 형식

### 사용자에게 보여줄 요약 (Markdown)
```markdown
## PM 분석 결과

**작업 유형**: {taskType}
**복잡도**: {complexity}
**단계**: {phase}

### 실행 체인
1. {step1}
2. {step2}
...

### 추정치
- 파일 수: {estimatedFiles}개
- 라인 수: {estimatedLines}줄
- 예상 시간: {estimatedTime}

{missingInfo가 있으면 질문 섹션 추가}
```

## 에러 처리

1. **스킬 실행 실패**: 에러 로그를 notes에 기록하고 사용자에게 보고
2. **미정의 단계**: 사용자에게 확인 요청
3. **질문 무한 루프**: 최대 3회 질문 제한, 이후 기본값으로 진행

## 계약
- 이 스킬은 다른 PM 스킬들을 오케스트레이션만 하고 직접 분석하지 않음
- 모든 분석 로직은 개별 PM 스킬에 위임
- patch 병합은 단순 오브젝트 머지 (깊은 병합)
- 사용자 질문은 AskUserQuestion 도구 사용
