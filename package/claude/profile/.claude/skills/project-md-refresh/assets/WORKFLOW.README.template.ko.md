# 워크플로우 가이드

## 목적
- 이 프로젝트의 공식 구현 흐름을 정의합니다.
- 문서나 스크립트가 충돌할 때 무엇을 기준으로 볼지 명확히 합니다.

## 문서 우선순위
1. `AGENTS.md` / `.claude/CLAUDE.md`
2. `.claude/PROJECT.md`
3. `README.md`
4. `TEST_GUIDE.md`
5. `docs/design/README.md`
6. `docs/glossary/README.md`
7. `docs/daily/README.md`
8. `docs/analysis/README.md`
9. `docs/` 아래 기능/기획 문서

## 런타임 역할
- **Claude**: [구현 / 계획 / 검증 역할]
- **Codex**: [구현 / 리뷰 / 영향 분석 역할]
- **Kimi 또는 연구 도구**: [선택적 조사 역할]

## 표준 진입점
- **기본 명령/프롬프트**: [명령어 / 워크플로우 진입점]
- **대형 작업 / phase 명령**: [명령어 / 워크플로우 진입점]
- **검증 명령**: [명령어]
- **일일 기록 방식**: [로그 갱신 방법]

## 브랜치 / 작업공간 정책
- 브랜치 명명: [규칙]
- worktree 또는 격리 작업공간 규칙: [규칙]
- dirty workspace 정책: [규칙]

## 구현 흐름
1. 범위와 기준 문서를 확인합니다.
2. `docs/design/README.md`, `docs/glossary/README.md`, `TEST_GUIDE.md`, 관련 `docs/analysis/*`를 읽습니다.
3. 프로젝트 규칙에 맞게 구현합니다.
4. 검증을 실행합니다.
5. 문서와 일일 로그를 갱신합니다.
6. 후속 작업을 기록합니다.

## 필수 갱신 규칙
- API/구조/정책이 바뀌면 관련 문서를 즉시 갱신합니다.
- 새 UI 패턴이 생기면 구현 전 또는 동시에 `docs/design/README.md`를 갱신합니다.
- 새 용어가 생기면 구현 전 또는 동시에 `docs/glossary/README.md`를 갱신합니다.

## 메모
- 간결하고 프로젝트 맞춤형으로 유지합니다.
- 모호한 설명보다 명시적 명령과 경로를 우선합니다.
