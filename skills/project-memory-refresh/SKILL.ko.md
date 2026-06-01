---
name: project-memory-refresh
description: 현재 프로젝트의 로컬 MemoryGraph 지식그래프를 명시적으로 생성하고 갱신합니다.
triggers:
  - "메모리 refresh"
  - "프로젝트 메모리 갱신"
  - "프로젝트 지식그래프 생성"
---

# 프로젝트 메모리 리프레시

사용자가 프로젝트 지식그래프 생성, refresh, 갱신을 명시적으로 요청했을 때만 사용합니다.

## 필수 흐름

1. Phase 01 Project Identity Resolver 계약으로 `projectId`를 결정합니다. `.claude/project.identity.yaml`, 계정 루트 registry alias map, canonical git remote/package/basename/path-hash fallback 순서를 따릅니다.
2. 현재 프로젝트 루트에서 `node .claude/scripts/memorygraph-project-index.mjs`를 실행합니다. 기본 `--analysis-level code`는 운영 중인 코드베이스를 파일, import, symbol, class, function, type, API/route surface 수준으로 인덱싱합니다.
3. 호환 seed/cache 경로를 확인합니다.
   - `.claude/cache/memorygraph/project-graph-seed.json`
   - `.claude/cache/memorygraph/promotion-candidates.json`
4. `project-memory-refresh`를 `memoryMode: write_requested`로 호출합니다.
5. 생성/건너뜀 처리된 node와 relationship 수를 보고합니다.

## Codex MCP transport fallback

Codex Desktop의 기존 Memory MCP tool 호출이 `Transport closed`로 실패하면 Codex를 재시작하지 말고 direct fallback을 실행합니다.

```bash
node .claude/scripts/memorygraph-direct.mjs health
node .claude/scripts/memorygraph-direct.mjs refresh-seed --seed .claude/cache/memorygraph/project-graph-seed.json --max-nodes 200
```

Windows sandbox가 `memorygraph.exe` 실행을 막으면 동일 명령을 승인 기반 escalated shell로 재실행합니다. direct fallback은 `.claude/memorygraph/memory.db`를 `MEMORY_SQLITE_PATH`로 지정합니다. 이 경로는 프로젝트 로컬 호환 그래프이며 durable Project Knowledge Plane namespace가 아닙니다.

## 경계

- durable project identity/state는 Project Identity Resolver와 계정 루트 namespace를 통해 해석합니다.
- `.claude/memorygraph/`와 `.claude/cache/memorygraph/`는 프로젝트 로컬 호환/cache artifact로 취급합니다.
- `.claude/docs/ko/`는 memory source로 읽지 않습니다.
- `.claude/memorygraph/`와 `.claude/cache/memorygraph/`는 커밋하지 않습니다.
- MemoryGraph가 불가하면 direct fallback까지 시도한 뒤 실패를 보고하되 일반 workflow는 막지 않습니다.

## 하네스 승격

이 스킬은 승격 후보를 만들 수 있지만, `moonshot-relay`에 저장하지 않습니다. 명시 승인 후 하네스 저장소에서 `harness-memory-promoter`를 사용합니다.

## Project Knowledge Boundary

`project-memory-refresh`는 seed/write boundary이며 prompt assembly step이 아닙니다. 이후 `knowledge-context-build.mjs` 실행에 필요한 project knowledge input은 갱신할 수 있지만, raw MemoryGraph/KG/ontology record를 orchestrator prompt에 주입하면 안 됩니다.

MemoryGraph unavailable은 사용자가 strict memory refresh를 명시한 경우가 아니면 non-blocking입니다. durable output은 typed knowledge state와 audit evidence이며, prompt-facing output은 계속 `projectKnowledgeContext` summary metadata뿐입니다.
