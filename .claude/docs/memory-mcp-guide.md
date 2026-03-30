# Memory MCP Server 사용 가이드

Memory MCP 서버는 Claude가 **세션 간에도 정보를 기억**할 수 있게 해주는 지식 그래프 기반 메모리 시스템입니다.

## 📌 설치

프로젝트가 Node `type: "module"` 환경이거나 Windows PowerShell/macOS zsh 셸 인용 차이가 있는 경우, `npx`와 JSON env를 직접 등록하지 말고 **래퍼 스크립트**를 등록하세요.

```bash
claude mcp add -s project memory node .claude/scripts/memory-mcp-wrapper.js
```

또는 `.claude/.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [".claude/scripts/memory-mcp-wrapper.js"]
    }
  }
}
```

이 방식의 장점:

1. `package.json`의 `"type": "module"` 여부와 무관하게 동작
2. Windows에서는 `npx.cmd`, macOS/Linux에서는 `npx`를 자동 선택
3. `MEMORY_FILE_PATH`를 셸별 JSON 인용 없이 안전하게 주입
4. `.claude/memory.json`이 비어 있거나 깨졌으면 자동 복구

## 🛠 사용 가능한 도구

| 도구 | 설명 |
|------|------|
| `create_entities` | 새 엔티티(사람, 프로젝트, 개념 등) 생성 |
| `create_relations` | 엔티티 간 관계 생성 |
| `add_observations` | 엔티티에 관찰/정보 추가 |
| `delete_entities` | 엔티티 삭제 |
| `delete_observations` | 특정 관찰 삭제 |
| `delete_relations` | 관계 삭제 |
| `read_graph` | 전체 지식 그래프 조회 |
| `search_nodes` | 쿼리로 엔티티 검색 |
| `open_nodes` | 특정 엔티티 상세 조회 |

## 💡 활용 예시

Claude에게 다음과 같이 요청하면 됩니다:

```
"이 프로젝트가 React 18, TypeScript, Zustand를 사용한다고 기억해줘"

"내 이름은 김철수이고, 백엔드 개발자라고 저장해줘"

"지난번에 이야기한 API 구조 기억나?"

"프로젝트의 주요 컴포넌트 구조를 정리해서 저장해줘"
```

## 📂 데이터 저장 위치

### 프로젝트별 메모리 (권장)

래퍼가 현재 작업 디렉토리 기준으로 자동 지정:

```json
".claude/memory.json"
```

### 전역 메모리

전역 메모리가 필요하면 래퍼 대신 직접 설정할 수 있지만, 셸마다 JSON 인용 규칙이 달라서 CLI 등록 시 오류가 나기 쉽습니다. 특히 아래와 같은 잘못된 JSON 문자열을 넘기면:

```text
{foo:"bar"}
```

다음 오류가 발생합니다:

```text
Expected property name or '}' in JSON at position 1 (line 1 column 2)
```

전역 메모리를 꼭 써야 한다면 `.mcp.json`에서 올바른 JSON으로 설정하세요:

```json
"env": {
  "MEMORY_FILE_PATH": "/Users/yourname/.claude-memory/global.json"
}
```

Windows 예시:

```json
"env": {
  "MEMORY_FILE_PATH": "C:/Users/yourname/.claude-memory/global.json"
}
```

## ⚠️ 주의사항

1. **민감한 정보**: 비밀번호, API 키 등은 저장하지 마세요
2. **Git 관리**: `.claude/memory.json`은 `.gitignore`에 추가 권장
3. **용량**: 대용량 데이터보다는 핵심 컨텍스트 위주로 저장
4. **권장 등록 방식**: macOS/Windows 공통으로 `node .claude/scripts/memory-mcp-wrapper.js` 사용

## 🔍 메모리 확인

현재 저장된 메모리 확인:

```
"저장된 메모리 전체를 보여줘"
"프로젝트 관련 정보만 검색해줘"
```

## 📚 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io)
- [server-memory npm](https://www.npmjs.com/package/@modelcontextprotocol/server-memory)
