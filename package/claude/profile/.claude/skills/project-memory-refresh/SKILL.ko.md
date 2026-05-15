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

1. `package.json` name, 디렉터리명 순서로 `projectId`를 결정합니다.
2. 현재 프로젝트 루트에서 `node .claude/scripts/memorygraph-project-index.mjs`를 실행합니다. 기본 `--analysis-level code`는 운영 중인 코드베이스를 파일, import, symbol, class, function, type, API/route surface 수준으로 인덱싱합니다.
3. seed 경로를 확인합니다.
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

Windows sandbox가 `memorygraph.exe` 실행을 막으면 동일 명령을 승인 기반 escalated shell로 재실행합니다. direct fallback은 `.claude/memorygraph/memory.db`를 `MEMORY_SQLITE_PATH`로 지정하므로 현재 프로젝트의 로컬 그래프에 씁니다.

## 경계

- 현재 프로젝트의 `.claude/memorygraph/`에만 씁니다.
- `.claude/docs/ko/`는 memory source로 읽지 않습니다.
- `.claude/memorygraph/`와 `.claude/cache/memorygraph/`는 커밋하지 않습니다.
- MemoryGraph가 불가하면 direct fallback까지 시도한 뒤 실패를 보고하되 일반 workflow는 막지 않습니다.

## 하네스 승격

이 스킬은 승격 후보를 만들 수 있지만, `claude-settings`에 저장하지 않습니다. 명시 승인 후 하네스 저장소에서 `harness-memory-promoter`를 사용합니다.
