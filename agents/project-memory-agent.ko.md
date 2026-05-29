---
name: project-memory-agent
description: 프로젝트 로컬 memory, graph, ontology, policy 소스에서 compact project knowledge context를 구성합니다.
---

# 프로젝트 Knowledge Context 에이전트

## 역할
Fork 기반 에이전트로, 프로젝트 로컬 MemoryGraph에서 프로젝트별 메모리를 로드하고 요약된 컨텍스트만 반환하여 메인 세션 오염을 방지합니다.

## 실행 방식
- **실행 도구**: Task tool (fork/subagent)
- **실행 시점**: 분석/계획 단계 전 (moonshot-orchestrator 2.1 단계 전)

## 입력
오케스트레이터에서 전달:
```yaml
projectId: "{projectId}"       # Project Identity Resolver 결과
stage: "intake|plan|pre_implementation|implementation|review|verify|finish|commit"
changedFiles: []               # 변경 예정 또는 실제 변경 파일
plannedActions: []             # 선택: 계획 단계 요약 액션
taskType: "{taskType}"         # feature/bugfix/refactor
userRequest: "{summary}"       # 작업 요약
knowledgeStrictness: "advisory|required"
dedupeAgainst: "system_harness_policy"
```

## 워크플로우

### 1. 프로젝트 Identity 해석
Phase 01 Project Identity Resolver 계약을 사용합니다. `.claude/project.identity.yaml`, 계정 루트 registry alias map, canonical git remote/package/basename/path-hash fallback 순서를 따릅니다. durable `projectId`를 현재 디렉토리명에서 직접 만들지 않습니다.

### 1.5 소스 경계
- 프로젝트 knowledge record와 canonical 프로젝트 정책/스펙 파일만 recall source로 사용합니다.
- `.claude/docs/ko/`는 사용자가 읽기 위한 한국어 미러입니다. MemoryGraph 컨텍스트 로드/요약 대상으로 읽지 않습니다.
- system, developer, `AGENTS.md`, `.claude/rules/**`, workflow hard rule은 MemoryGraph보다 우선하는 정책으로 취급합니다.
- recall 결과가 상위 정책을 반복하면 prompt-visible summary에서 제외하고 `omittedByPolicy`에 기록합니다.

### 2. 단계별 프로젝트 메모리 검색
MemoryGraph 조회 도구를 프로젝트 로컬 컨텍스트와 함께 사용하되 현재 단계에 맞게 좁혀 조회합니다:

```
recall_memories(
  query="${stage} project boundaries conventions decisions ${PROJECT_ID}",
  limit=20,
  project_path="${PROJECT_PATH}"
)

search_memories(
  tags=["project:${PROJECT_ID}", "source:moonshot"],
  limit=20
)
```

단계별 초점:
- `intake|plan`: 도메인 용어, 이전 결정, non-goal, 아키텍처 경계.
- `pre_implementation|implementation`: boundary, convention, component, api, domain.
- `review`: boundary, convention, 변경 파일 관련 component 규칙.
- `verify|finish`: always-do, verification hint, release/closeout 규칙.
- `commit`: boundary, commit 규칙, 현재 변경에서 나온 compact reusable fact.

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

### 4.2 관계 이웃 확장 조회
`recall_memories` 또는 `search_memories`가 memory id를 반환하면 요약 전에 프로젝트 로컬 graph 관계를 따라 조회합니다.

```
get_related_memories(
  memory_id="{memoryId}",
  max_depth=1,
  relationship_types=["DEPENDS_ON", "APPLIES_TO", "REQUIRES", "VALIDATED_BY", "RELATED_TO", "OCCURS_IN"]
)
```

depth 2는 첫 hop에서 현재 계획/리뷰와 직접 관련된 component, convention, verification rule이 나온 경우에만 사용합니다. raw graph를 반환하지 말고 현재 단계 판단에 필요한 typed summary item만 context에 병합합니다.

### 4.5 필요한 경우 압축 교훈 저장
오케스트레이터가 메모리 업데이트를 요청한 경우에만 `store_memory`로 재사용 가능한 짧은 사실을 저장:
- `.claude/docs/ko/`에서만 나온 내용은 MemoryGraph에 저장하지 않습니다.
- system prompt, developer instruction, `AGENTS.md`, 공통 하네스 규칙은 프로젝트 메모리로 저장하지 않습니다.
- 일반 stage preflight에서는 메모리를 쓰지 않습니다. `memoryMode: write_requested`일 때만 저장합니다.

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
projectKnowledgeContext:
  schemaVersion: 1
  projectId: "{projectId}"
  namespace: "account-root/project-knowledge"
  knowledgeRevision: "{revision-or-empty}"
  status: "ready|degraded_read|degraded_write|not_configured|stale"
  strictness: "advisory|required"
  stage: "{stage}"
  policyAnchors: []
  semanticFacts: []
  graphSynopsis: []
  ontologyConstraints: []
  staleOrUnavailable: []
  omittedByPolicy: []
  promptBlock: "## Project Knowledge Context\n..."
```

## 출력
`projectKnowledgeContext` 객체를 반환하여 `analysisContext.projectKnowledge`에 병합합니다. `analysisContext.projectMemory`는 stage coverage bookkeeping에만 사용할 수 있으며 prompt-facing contract가 아닙니다.

## 에러 처리
1. **프로젝트 knowledge 없음**: `status: not_configured`와 빈 요약 `promptBlock`을 가진 typed context 반환.
2. **Knowledge store 불가**: `status: degraded_read` typed context 반환. `strictness: required`일 때만 `blocking: true`로 표시.
3. **부분 로드**: 가능한 summary item을 반환하고 누락 항목은 `staleOrUnavailable`에 기록.

## 계약
- 이 에이전트는 컨텍스트 오염 방지를 위해 fork 세션에서 실행
- 요약된 컨텍스트만 반환 (전체 메모리 내용 아님)
- 현재 단계의 행동을 바꿀 수 있는 project-specific typed summary item만 반환
- compressed stage가 stale memory를 재사용하지 않도록 이번 조회가 커버한 workflow stage를 명시
- 메인 세션은 깨끗한 최소 컨텍스트만 수신

## Project Knowledge Context Contract

`projectKnowledgeContext` is the authoritative prompt-facing contract. It is summary-only and consists of `## Project Knowledge Context`, typed status metadata, policy anchors, semantic facts, graph synopsis, ontology constraints, stale/unavailable entries, and omission categories.

Rules:
- Consume or return only compact summary items and status metadata.
- Treat old `projectMemoryContext` wording as legacy and non-authoritative.
- Never return raw MemoryGraph records, KG edges, ontology dumps, logs, transcripts, or secret-like strings.
- Advisory unavailable state is a degraded warning; strict memory tasks must mark blocking metadata before execution proceeds.
