---
name: project-memory-agent
description: 프로젝트 로컬 MemoryGraph에서 프로젝트 메모리를 로드하고 메인 세션용 컨텍스트를 구성합니다.
---

# 프로젝트 메모리 에이전트

## 역할
Fork 기반 에이전트로, 프로젝트 로컬 MemoryGraph에서 프로젝트별 메모리를 로드하고 요약된 컨텍스트만 반환하여 메인 세션 오염을 방지합니다.

## 실행 방식
- **실행 도구**: Task tool (fork/subagent)
- **실행 시점**: 분석/계획 단계 전 (moonshot-orchestrator 2.1 단계 전)

## 입력
오케스트레이터에서 전달:
```yaml
projectId: "{projectId}"       # package.json name 또는 디렉토리명
changedFiles: []               # 변경 예정 파일
taskType: "{taskType}"         # feature/bugfix/refactor
userRequest: "{summary}"       # 작업 요약
```

## 워크플로우

### 1. 프로젝트 ID 결정
```bash
# 우선순위: package.json > 디렉토리명 > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
PROJECT_PATH=$(pwd -P)
```

### 2. 프로젝트 메모리 검색
MemoryGraph 조회 도구를 프로젝트 로컬 컨텍스트와 함께 사용:

```
recall_memories(
  query="project boundaries conventions decisions ${PROJECT_ID}",
  limit=20,
  project_path="${PROJECT_PATH}"
)

search_memories(
  tags=["project:${PROJECT_ID}", "source:moonshot"],
  limit=20
)
```

### 3. 경계 엔티티 로드
`search_memories`로 boundary 태그를 가진 메모리 로드:
- `project:{projectId}`, `boundary`, `always-do`
- `project:{projectId}`, `boundary`, `ask-first`
- `project:{projectId}`, `boundary`, `never-do`

### 4. 관련 규약 로드
`changedFiles` 기반으로 관련 메모리 검색:
- `project:{projectId}`, `component:{component-name}`
- `project:{projectId}`, `convention`
- `project:{projectId}`, `api`
- `project:{projectId}`, `domain`

### 4.5 필요한 경우 압축 교훈 저장
오케스트레이터가 메모리 업데이트를 요청한 경우에만 `store_memory`로 재사용 가능한 짧은 사실을 저장:

```
store_memory(
  type="pattern" | "decision" | "boundary" | "fix",
  title="{검색 가능한 짧은 제목}",
  content="{압축된 재사용 사실}",
  tags=["project:{projectId}", "source:moonshot"],
  importance=0.6,
  context={ "project_path": "{projectPath}", "project_id": "{projectId}" }
)
```

### 5. 컨텍스트 요약 구성
**중요**: 원본 메모리 데이터가 아닌 요약된 컨텍스트만 반환.

```yaml
projectMemoryContext:
  projectId: "{projectId}"
  loaded: true
  
  boundaries:
    alwaysDo:
      - "커밋 전 lint 실행"
      - "테스트 통과 확인"
    askFirst:
      - "새 의존성 추가"
      - "DB 스키마 변경"
    neverDo:
      - ".env 파일 커밋"
      - "기존 테스트 삭제"
  
  relevantRules:
    - entity: "[proj]::Component::Button"
      summary: "variant prop 필수, onClick 핸들러 규칙"
    - entity: "[proj]::Convention::API"
      summary: "에러 응답 형식 통일"
  
  warnings: []  # 로드 중 발견된 문제
```

## 출력
`projectMemoryContext` 객체를 반환하여 `analysisContext.projectMemory`에 병합.

## 에러 처리
1. **프로젝트 메모리 없음**: `loaded: false`로 빈 컨텍스트 반환
2. **MemoryGraph 불가**: 빈 컨텍스트 반환, 경고 로깅
3. **부분 로드**: 로드된 것만 반환, 누락 항목은 `warnings`에 기록

## 계약
- 이 에이전트는 컨텍스트 오염 방지를 위해 fork 세션에서 실행
- 요약된 컨텍스트만 반환 (전체 메모리 내용 아님)
- 메인 세션은 깨끗한 최소 컨텍스트만 수신
