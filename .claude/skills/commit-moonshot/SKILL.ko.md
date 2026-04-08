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
이 명령어는 메인 세션에서 실행되며, 변경사항을 분석하고 전역 Memory MCP에 프로젝트 메모리(`[ProjectID]::*`)를 항상 최신 상태로 현행화합니다.

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

변경 파일에서 다음 정보 추출:
- 컴포넌트 이름 (from paths like `src/components/Button.tsx`)
- 도메인 영역 (from paths like `src/domains/user/`)
- API 엔드포인트 (from API-related files)
- 코딩 패턴 (반복되는 구조)

## 4. 3단계 경계 현행화

### 기존 경계 확인
`search_nodes`로 `[PROJECT_ID]::Boundary::*` 검색

### 경계가 없는 경우 (첫 사용)
기본 경계 생성:
```
create_entities([
  { name: "[PROJECT_ID]::Boundary::AlwaysDo", entityType: "boundary", observations: ["커밋 전 lint 실행", "테스트 통과 확인"] },
  { name: "[PROJECT_ID]::Boundary::AskFirst", entityType: "boundary", observations: ["새 의존성 추가", "DB 스키마 변경"] },
  { name: "[PROJECT_ID]::Boundary::NeverDo", entityType: "boundary", observations: [".env 파일 커밋", "기존 테스트 삭제"] }
])
```

### 새로운 경계 발견 시 추가
변경사항 분석 중 다음을 발견하면 해당 경계에 추가:

| 발견 내용 | 추가 대상 |
|----------|----------|
| 필수 실행 명령어 | `[PROJECT_ID]::Boundary::AlwaysDo` |
| 승인 필요 패턴 | `[PROJECT_ID]::Boundary::AskFirst` |
| 금지 패턴 | `[PROJECT_ID]::Boundary::NeverDo` |

예시:
```
# CI에서 반드시 실행해야 하는 명령어 발견 시
add_observations("[my-app]::Boundary::AlwaysDo", ["npm run build 전 npm run lint 필수"])
```

## 5. 도메인/컴포넌트 메모리 현행화

### 엔티티 생성/업데이트 규칙

| 변경 유형 | 액션 |
|----------|------|
| 새 컴포넌트 파일 | `create_entities`로 `[PROJECT_ID]::Component::[Name]` 생성 |
| 기존 컴포넌트 수정 | `add_observations`로 변경 내용 추가 |
| API 엔드포인트 추가/변경 | `[PROJECT_ID]::API::[EndpointName]` 업데이트 |
| 도메인 로직 변경 | `[PROJECT_ID]::Domain::[DomainName]` 업데이트 |

### 관계 설정
컴포넌트 간 의존관계 발견 시:
```
create_relations([{
  from: "[my-app]::Component::Button",
  to: "[my-app]::Component::ThemeContext",
  relationType: "uses"
}])
```

## 6. 코딩 규약 현행화

반복되는 패턴 발견 시 `[PROJECT_ID]::Convention::[Name]`으로 등록:
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
- [proj]::Component::NewComponent

**업데이트된 엔티티:**
- [proj]::Component::Button (새 prop 추가됨)

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

## 7.6 `.claude/memory.json` 포함 여부 확인
프로젝트 메모리 현행화는 항상 수행하세요. 사용자 확인이 필요한 것은 현행화 결과로 갱신된 `.claude/memory.json`을 이번 커밋에 포함할지 여부뿐입니다.

권장 질문:
```text
커밋 과정에서 `.claude/memory.json`이 업데이트되었습니다. 이번 커밋에 함께 포함할까요?
```

규칙:
- `.claude/memory.json` 포함 여부와 무관하게 프로젝트 메모리 현행화 자체는 항상 먼저 완료하세요.
- 사용자 확인 없이 `.claude/memory.json`을 자동으로 스테이징하지 마세요.
- 사용자가 포함하자고 하면 코드/문서 변경과 함께 스테이징해서 커밋하세요.
- 사용자가 제외하자고 하면 `.claude/memory.json`은 unstaged 상태로 두고 나머지만 커밋하세요.
- 최종 커밋 요약에 사용자의 선택을 명시하세요.

## 8. 커밋 생성

```bash
# 사용자가 메모리 파일 포함을 승인한 경우:
git add [files] .claude/memory.json

# 사용자가 제외를 선택한 경우:
git add [files]
git commit -m "[간결한 한글 제목]" -m $'- 기능: [기능/영역명] - [핵심 변경]\n- 기능: [기능/영역명] - [핵심 변경]\n- 이유: [변경 이유]\n- 영향: [사용자 영향 또는 기대 효과]'
```

> **📌 중요: `.claude/memory.json` 파일 포함 여부는 사용자 명시 선택을 따르세요.** 이 파일에는 Memory MCP 현행화 내용이 저장됩니다.

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
