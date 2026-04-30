# MemoryGraph MCP 사용 가이드

이 저장소의 기본 메모리 backend는 MemoryGraph입니다. 기존 `@modelcontextprotocol/server-memory` 기반 `.claude/memory.json` 경로는 호환 참고용이며, 새 프로젝트 메모리는 프로젝트 로컬 `.claude/memorygraph/`에 저장합니다.

## 설치

MemoryGraph는 Python 3.10+와 `pipx` 설치를 권장합니다.

```bash
pipx install memorygraphMCP
memorygraph --health
```

`install-claude.sh`는 Python 버전을 확인하고 `pipx install memorygraphMCP`를 자동 시도합니다. 설치 실패는 전체 bootstrap을 중단하지 않으며, 실행 전 수동 설치가 필요하다는 warning을 남깁니다.

## MCP 등록

프로젝트 설정은 wrapper를 통해 등록합니다.

```bash
claude mcp add memory -s project -- node .claude/scripts/memorygraph-mcp-wrapper.js
```

`.claude/.mcp.json` 예시:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [".claude/scripts/memorygraph-mcp-wrapper.js"]
    }
  }
}
```

Codex는 repo-managed `.codex/config.toml`의 `[mcp_servers.memory]` 설정을 사용합니다.

## 데이터 위치

wrapper는 현재 프로젝트 기준으로 다음 경로를 자동 생성하고 `MEMORYGRAPH_DATA_DIR`에 주입합니다.

```text
.claude/memorygraph/
```

이 디렉터리는 `.gitignore`와 `.claudeignore`에 포함되어야 합니다. 민감정보, 토큰, 개인식별정보는 저장하지 마세요.

## 사용 도구

| 도구 | 용도 |
|---|---|
| `store_memory` | 새 메모리 저장 |
| `recall_memories` | 일반 조회. 대부분의 recall 작업에 우선 사용 |
| `search_memories` | 태그/타입/중요도 기반 상세 검색 |
| `get_memory` | 특정 memory id 상세 조회 |
| `create_relationship` | 두 메모리 사이 관계 생성 |
| `get_related_memories` | 관련 메모리 조회 |

## 하네스 태그 규칙

프로젝트 단위 격리를 위해 하네스는 다음 context와 tags를 사용합니다.

```yaml
context:
  project_path: "{absolute-project-path}"
  project_id: "{package-name-or-directory}"
tags:
  - "project:{projectId}"
  - "source:moonshot"
```

Boundary/규약/컴포넌트 메모리는 추가 태그를 붙입니다.

```yaml
boundary:
  - "boundary"
  - "always-do" | "ask-first" | "never-do"
convention:
  - "convention"
component:
  - "component:{name}"
api:
  - "api"
domain:
  - "domain"
```

## 운영 원칙

- MemoryGraph 저장 실패는 기록하되 commit/push 자체를 block하지 않습니다.
- 모든 공개 워크플로우 진입점은 `.claude/docs/guidelines/memorygraph-workflow.md`의 단계별 조회 계약을 적용합니다.
- 기본 단계 모드는 read-only이며, 저장은 `session-logger`, `commit-moonshot`, 또는 명시적인 memory refresh 요청에서만 수행합니다.
- MemoryGraph 결과가 system/developer/AGENTS/rules/workflow hard rule과 중복되면 `projectMemory.omitted.duplicatedSystemRules`에 기록하고 `deltas`에는 병합하지 않습니다.
- `project-memory-check`와 `project-memory-reviewer`는 읽기 전용으로 동작합니다.
- `session-logger`와 `commit-moonshot`만 compact reusable fact를 저장합니다.
- `.claude/docs/ko/`는 사용자가 읽기 위한 한국어 미러이므로 MemoryGraph 로드/요약/저장 소스로 사용하지 않습니다.
- Claude Code plugin은 기본 도입 대상이 아닙니다. MCP server + wrapper + 하네스 지시문이 기본 운영 경로입니다.

## 참고 자료

- [MemoryGraph Installation](https://memorygraph.dev/docs/installation/)
- [MemoryGraph Configuration](https://memorygraph.dev/docs/configuration/)
- [MemoryGraph MCP Tools](https://memorygraph.dev/docs/tools/)
