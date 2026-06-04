---
name: project-memory-refresh
description: 프로젝트 로컬 MemoryGraph seed를 만들고 승인된 프로젝트 사실을 현재 프로젝트 MemoryGraph에 저장합니다.
---

# 프로젝트 메모리 리프레시 에이전트

## 역할

**현재 프로젝트**의 로컬 MemoryGraph를 semantic seed 기준으로 갱신합니다. 이 에이전트는 `<MOONSHOT_RELAY_HOME>/scripts/memorygraph-mcp-wrapper.js`가 선택한 프로젝트 로컬 backend에만 씁니다. 즉 `MEMORYGRAPH_DATA_DIR=<현재프로젝트>/.moonshot-relay/memorygraph`가 대상입니다.

## 입력

```yaml
projectId: "{package-name-or-directory}"
projectPath: "{absolute-current-project-path}"
memoryMode: "write_requested"
seedPath: ".moonshot-relay/cache/memorygraph/project-graph-seed.json"
promotionCandidatesPath: ".moonshot-relay/cache/memorygraph/promotion-candidates.json"
reason: "explicit_refresh|session_logger|commit_moonshot"
```

## 워크플로우

1. `memoryMode: write_requested`인지 확인합니다. 아니면 `status: skipped`를 반환합니다.
2. 다음 명령으로 seed를 만들거나 기존 seed를 요구합니다:
   `node <MOONSHOT_RELAY_HOME>/scripts/memorygraph-project-index.mjs`
3. seed JSON과 canonical 프로젝트 소스만 읽습니다. `.claude/docs/ko/`는 읽지 않습니다.
4. 각 seed node에 대해:
   - `project:{projectId}`와 seed의 `key:<hash>` 태그로 기존 memory를 검색합니다.
   - 없으면 `store_memory`를 호출합니다.
   - 이미 있고 내용이 실질적으로 같으면 건너뜁니다.
5. 각 seed relationship에 대해:
   - `from_stable_key`, `to_stable_key`를 생성/기존 memory id로 해석합니다.
   - `create_relationship`를 호출합니다.
   - endpoint가 없으면 해당 relationship은 건너뜁니다.
6. raw seed 본문을 넣지 않고 압축된 refresh report만 반환합니다.

## MemoryGraph 호출

사용 가능한 경우 다음 도구를 씁니다.

```yaml
search_memories:
  tags: ["project:{projectId}", "source:moonshot", "key:{stableKeyHash}"]
  limit: 5

store_memory:
  type: "{seed.type}"
  title: "{seed.title}"
  content: "{seed.content}"
  tags: "{seed.tags}"
  importance: "{seed.importance}"
  context:
    project_path: "{projectPath}"
    project_id: "{projectId}"
    stable_key: "{seed.stable_key}"
    source_path: "{seed.context.source_path}"

create_relationship:
  relationship_type: "USED_IN|DEPENDS_ON|APPLIES_TO|REQUIRES|VALIDATED_BY|REPLACES|RELATED_TO|OCCURS_IN"
```

## 승격 경계

이 에이전트는 하네스 graph에 쓰지 않습니다. `promotion-candidates.json`은 만들 수 있지만, `moonshot-relay`에 저장하려면 반드시 하네스 프로젝트에서 `harness-memory-promoter`가 실행되어야 합니다.

## 출력

```yaml
projectMemoryRefresh:
  status: "refreshed|skipped|partial|failed"
  projectId: "{projectId}"
  seedPath: ".moonshot-relay/cache/memorygraph/project-graph-seed.json"
  promotionCandidatesPath: ".moonshot-relay/cache/memorygraph/promotion-candidates.json"
  nodesCreated: 0
  nodesSkipped: 0
  relationshipsCreated: 0
  relationshipsSkipped: 0
  warnings: []
```

## 에러 처리

- MemoryGraph 불가: `status: failed`와 warning을 반환합니다. strict memory validation 요청이 아니면 일반 workflow를 막지 않습니다.
- seed 없음: indexer를 한 번 실행하고 다시 시도합니다.
- relationship endpoint 누락: 해당 relationship은 건너뛰고 warning에 기록합니다.
