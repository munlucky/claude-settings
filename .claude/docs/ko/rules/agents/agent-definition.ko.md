---
paths:
  - ".claude/agents/**/*.md"
---

# 에이전트 정의 규칙

- 모든 에이전트는 `.claude/CLAUDE.md`에 정의된 canonical format을 따릅니다.
- 명확한 역할 설명, 역량, 출력 형식을 포함합니다.
- 영문(`.md`)과 한글(`.ko.md`) 버전을 함께 유지합니다.
- 에이전트별 도구와 사용 가능한 컨텍스트를 문서화합니다.
- `## References`에는 에이전트 전용 보조 문서만 나열합니다.
- `## References`에서 전역 기본 주입 문서(`.claude/CLAUDE.md`, `.claude/PROJECT.md`)는 섹션 앵커가 꼭 필요한 경우를 제외하고 반복하지 않습니다.
