---
name: commit-moonshot
description: 사용자가 둘 다 명시적으로 원할 때 프로젝트 메모리 현행화와 커밋을 함께 수행합니다.
triggers:
  - "commit-moonshot"
  - "moonshot commit"
  - "memory commit"
---

# 프로젝트 메모리 현행화 및 커밋

## 상태

지원되는 공개 유틸리티 진입점입니다.
기본 구현 체인에는 포함하지 않지만, 사용자가 프로젝트 메모리 현행화와 커밋을 함께 원할 때 직접 호출 가능해야 합니다.
자동 단계가 아니라 명시적 Finish-stage 유틸리티로 취급합니다.

## 개요
이 명령어는 메인 세션에서 실행되며, 변경사항을 분석하고 프로젝트 로컬 MemoryGraph에 프로젝트 메모리를 항상 최신 상태로 현행화합니다.

> **⚠️ 중요: 반드시 Memory 현행화(1~7단계)를 먼저 완료한 후 커밋(8단계)을 수행하세요.**

## 1. 변경사항 분석
```bash
git status
git diff --cached --stat
git log -3 --oneline
```

## 2. 프로젝트 ID 확인
```bash
# 우선순위: package.json > 디렉토리명 > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
```

## 3. 변경 파일 분석
```bash
git diff --cached --name-only
```

메모리 소스 경계:
- `.claude/docs/ko/`는 사용자가 읽기 위한 한국어 미러입니다.
- MemoryGraph 현행화 중 이 경로를 메모리 소스로 읽거나, 이 경로에서만 나온 내용을 저장하지 않습니다.
- `.agents/`와 `.agents/skills`는 생성된 agent bridge입니다. 사용자가 명시적으로 추적하라고 하지 않는 한 `git add -- <paths>` 목록에 넣지 않습니다.
- 이전 명령, 도구 출력, 사용자가 붙여넣은 후보 경로 목록에 `.agents` 또는 `.agents/skills`가 들어 있어도 그대로 실행하지 않습니다. 실행 전 후보 목록에서 반드시 제거합니다.
- `git add -A -- .agents`, `git add -A -- .agents/skills`, 또는 `.agents/skills`가 포함된 긴 explicit path list는 금지입니다.
- `git add -- <paths>` 실행 전 후보 목록에서 다음 deny 패턴을 제거합니다: `.agents`, `.agents/**`, `.mcp.json`, `.claude/memory.json`, `.claude/memorygraph/**`, `.claude/cache/memorygraph/**`.
- installer/harness 커밋은 가능하면 루트 단위로 staging합니다: `.claude`, `.codex`, `.claudeignore`, `.gitattributes`, `.gitignore`, `AGENTS.md`, 그리고 명시적으로 바뀐 제품 문서/코드. `.agents`는 포함하지 않습니다.

변경 파일에서 다음 정보 추출:
- 컴포넌트 이름 (from paths like `src/components/Button.tsx`)
- 도메인 영역 (from paths like `src/domains/user/`)
- API 엔드포인트 (from API-related files)
- 코딩 패턴 (반복되는 구조)

## 4. 3단계 경계 현행화

MemoryGraph 호출은 `stage=commit`, `memoryMode=write_requested`로 수행합니다.
프로젝트에 `.claude/scripts/commit-moonshot-memory-refresh.mjs`가 있으면 아래 helper를 우선 사용합니다. 이 helper는 Codex Desktop에 붙은 MCP transport가 stale이어도 별도 MemoryGraph child process로 자동 우회하고, 결과 로그를 `.claude/logs/memorygraph/`에 남깁니다.

```bash
node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id "$PROJECT_ID"
```

`mcp__memory__.store_memory`가 `Transport closed`로 실패했고 저장 payload가 명확하면, 같은 payload를 임시 JSON 파일로 저장한 뒤 동일 내용을 direct fallback으로 저장합니다.

```bash
node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id "$PROJECT_ID" --mcp-error "Transport closed" --store-json @.claude/cache/memorygraph/commit-store-payload.json
```

구형 프로젝트에 helper가 없으면 `.claude/scripts/memorygraph-project-index.mjs`를 먼저 실행해 운영 중인 코드베이스의 파일/import/symbol/API route 수준 seed를 생성한 뒤 `project-memory-refresh` 또는 direct fallback으로 반영합니다.
system/developer/AGENTS/rules/workflow hard rule과 중복되는 항목은 저장하지 말고 `projectMemory.omitted.duplicatedSystemRules`에 기록합니다.

### Codex MCP transport fallback
Codex Desktop에 이미 붙어 있는 Memory MCP가 `Transport closed`로 실패하면 Codex 재시작을 요구하지 않습니다. 즉시 commit refresh helper를 사용해 별도 MemoryGraph stdio child process를 띄우는 direct fallback을 사용합니다.

```bash
node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id "$PROJECT_ID" --mcp-error "Transport closed"
```

규칙:
- `Transport closed`는 저장 payload 실패가 아니라 Codex app-server의 기존 MCP transport 실패로 간주합니다.
- direct fallback이 성공하면 메모리 현행화는 완료로 취급하고, Codex 재시작을 사용자에게 요구하지 않습니다.
- helper는 `mcp_transport_failed -> direct_fallback` 상태를 로그에 남깁니다.
- 저장 payload가 있으면 `--store-json`으로 같은 내용을 저장하고, payload가 없으면 `memorygraph-project-index.mjs`와 `refresh-seed`를 실행합니다.
- direct fallback도 실패한 경우에만 실패 원인을 기록하고 Git closeout을 계속 진행합니다.
- Windows sandbox가 `memorygraph.exe` 실행을 막으면 동일 명령을 승인 기반 escalated shell로 재실행합니다.
- helper와 direct client는 timeout과 owned child-process tree cleanup을 수행합니다. 광범위한 `memorygraph.exe` kill은 금지하고, 자신이 시작한 child tree만 정리합니다.
- direct fallback은 `.claude/memorygraph/memory.db`를 `MEMORY_SQLITE_PATH`로 사용합니다. `.claude/memorygraph/**`와 `.claude/cache/memorygraph/**`는 사용자가 명시적으로 포함하지 않는 한 커밋하지 않습니다.

### 기존 경계 확인
`recall_memories`와 `search_memories`로 `project:{PROJECT_ID}`, `boundary` 태그를 가진 메모리 검색

### 경계가 없는 경우 (첫 사용)
기본 경계 생성:
```
store_memory(type="boundary", title="AlwaysDo", content="커밋 전 lint 실행; 테스트 통과 확인", tags=["project:{PROJECT_ID}", "boundary", "always-do", "source:moonshot"], context={ "project_path": "{PROJECT_PATH}", "project_id": "{PROJECT_ID}" })
store_memory(type="boundary", title="AskFirst", content="새 의존성 추가; DB 스키마 변경", tags=["project:{PROJECT_ID}", "boundary", "ask-first", "source:moonshot"], context={ "project_path": "{PROJECT_PATH}", "project_id": "{PROJECT_ID}" })
store_memory(type="boundary", title="NeverDo", content=".env 파일 커밋 금지; 기존 테스트 삭제 금지", tags=["project:{PROJECT_ID}", "boundary", "never-do", "source:moonshot"], context={ "project_path": "{PROJECT_PATH}", "project_id": "{PROJECT_ID}" })
```

### 새로운 경계 발견 시 추가
변경사항 분석 중 다음을 발견하면 해당 경계에 추가:

| 발견 내용 | 추가 대상 |
|----------|----------|
| 필수 실행 명령어 | `boundary`, `always-do` 태그 |
| 승인 필요 패턴 | `boundary`, `ask-first` 태그 |
| 금지 패턴 | `boundary`, `never-do` 태그 |

예시:
```
# CI에서 반드시 실행해야 하는 명령어 발견 시
store_memory(type="boundary", title="Build requires lint", content="npm run build 전 npm run lint 필수", tags=["project:my-app", "boundary", "always-do", "source:moonshot"])
```

## 5. 도메인/컴포넌트 메모리 현행화

### 메모리 생성/업데이트 규칙

| 변경 유형 | 액션 |
|----------|------|
| 새 컴포넌트 파일 | `store_memory` + `component:[Name]` 태그 |
| 기존 컴포넌트 수정 | `store_memory`로 압축 변경 사실 추가 |
| API 엔드포인트 추가/변경 | `api` 태그로 업데이트 |
| 도메인 로직 변경 | `domain` 태그로 업데이트 |

### 관계 설정
컴포넌트 간 의존관계 발견 시:
```
create_relationship(from_memory_id="{fromId}", to_memory_id="{toId}", relationship_type="USED_IN", context="Button uses ThemeContext")
```

## 6. 코딩 규약 현행화

반복되는 패턴 발견 시 `convention` 태그와 함께 등록:
- 네이밍 규칙 (예: 컴포넌트는 PascalCase)
- 파일 구조 패턴 (예: feature-based structure)
- 에러 처리 패턴 (예: try-catch with logging)
- API 응답 형식 (예: { success, data, error })

## 7. 현행화 요약 출력
현행화 완료 후 변경 내용 요약:
```markdown
### 프로젝트 메모리 현행화 완료

**프로젝트**: {PROJECT_ID}

**생성된 엔티티:**
- `project:{PROJECT_ID}` / `component:NewComponent`

**업데이트된 엔티티:**
- `project:{PROJECT_ID}` / `component:Button` (새 prop 추가됨)

**새 관계:**
- Button → ThemeContext (uses)

**경계 업데이트:**
- AlwaysDo: +1 항목
```

- AlwaysDo: +1 항목

## 7.5 문서 스테이징 확인
모든 문서 파일(자동 생성본 포함)이 스테이징되었는지 확인:
```bash
git add CHANGELOG.md README.md .claude/PROJECT.md docs/generated/*
```

생성된 agent bridge와 로컬 런타임 파일은 스테이징 후보에서 제거:
```bash
# 금지 예시:
git add -A -- .agents/skills ...

# 권장 예시:
git add -- .claude .codex .claudeignore .gitattributes .gitignore AGENTS.md README.md
```

## 7.6 메모리 산출물 포함 여부 확인
프로젝트 메모리 현행화는 항상 수행하세요. 사용자 확인이 필요한 것은 현행화 결과로 갱신된 `.claude/memory.json`, `.claude/memorygraph/`, `.claude/cache/memorygraph/`를 이번 커밋에 포함할지 여부뿐입니다.

권장 질문:
```text
커밋 과정에서 프로젝트 메모리 산출물이 업데이트되었습니다. 이번 커밋에 함께 포함할까요?
```

규칙:
- `.claude/memory.json` 포함 여부와 무관하게 프로젝트 메모리 현행화 자체는 항상 먼저 완료하세요.
- 사용자 확인 없이 `.claude/memory.json`, `.claude/memorygraph/`, `.claude/cache/memorygraph/`를 자동으로 스테이징하지 마세요.
- 사용자가 포함하자고 하면 코드/문서 변경과 함께 스테이징해서 커밋하세요.
- 사용자가 제외하자고 하면 메모리 산출물은 unstaged 상태로 두고 나머지만 커밋하세요.
- MemoryGraph 저장 실패는 direct fallback까지 시도한 뒤 기록하되, 사용자가 commit/push를 명시한 흐름에서는 Git closeout을 막지 마세요.
- 일반 프로젝트 커밋 중 승격 후보를 `claude-settings` graph에 자동 저장하지 마세요. 명시 승인 후 `harness-memory-promoter`를 사용하세요.
- 최종 커밋 요약에 사용자의 선택을 명시하세요.

## 8. 커밋 생성

```bash
# 사용자가 메모리 산출물 포함을 승인한 경우:
git add [files] .claude/memory.json .claude/memorygraph

# 사용자가 제외를 선택한 경우:
git add [files]
git commit -m "[간결한 한글 제목]" -m $'- 기능: [기능/영역명] - [핵심 변경]\n- 기능: [기능/영역명] - [핵심 변경]\n- 이유: [변경 이유]\n- 영향: [사용자 영향 또는 기대 효과]'
```

> **📌 중요: 메모리 산출물 포함 여부는 사용자 명시 선택을 따르세요.** MemoryGraph 기본 저장소는 `.claude/memorygraph/`입니다.

**커밋 메시지 규칙:**
- 이모지, 특수문자 제외
- 커밋 제목과 본문을 항상 한글로 작성
- 간결하고 명확하게
- 변경 목적 중심
- 제목 1줄 + 본문 리스트 형식을 기본값으로 사용
- 본문 첫 줄부터 변경내역을 기능 단위로 리스트업
- 기능이 2개 이상이면 기능마다 별도 bullet로 분리
- 각 기능 bullet은 `- 기능: [기능/영역명] - [핵심 변경]` 형식 사용
- 기능 bullet 뒤에는 아래 항목을 필요 최소한으로 추가:
  - `- 이유: [왜 변경했는지]`
  - `- 영향: [사용자 영향, 운영 영향, 기대 효과 중 필요한 내용]`
- 기능 단위로 묶기 어려운 변경도 가장 가까운 기능/영역 기준으로 분류

**최종 사용자 보고 규칙:**
- 커밋 전후 변경 요약도 항상 한글로 작성
- 변경 요약은 커밋 메시지와 동일하게 기능 단위 bullet list로 정리
- 파일 나열보다 사용자/도메인 관점의 기능 묶음을 우선 사용

---

사용자 컨텍스트: $ARGUMENTS
