# 글로벌 개발 지침

> 항상 로드되는 엔트리 맵 문서입니다. 본문 정책을 길게 넣지 않습니다.

Last-Reviewed: 2026-03-05

## 개요

`.claude/rules/`의 규칙은 재귀적으로 자동 로드됩니다. 이 문서에는 Tier-1 제약만 유지합니다.

## Tier-1 제약

1. `AGENTS.md`와 이 문서는 TOC이며, 전체 정책 저장소가 아닙니다.
2. 지속 정책은 아래 소스 오브 트루스에 둡니다.
   - `.claude/PROJECT.md` (프로젝트 계약)
   - `.claude/rules/` (강제 규칙)
   - `.claude/docs/guidelines/` (운영 절차)
3. 항상 로드되는 컨텍스트는 최소화합니다.
   - `.claude/rules/**/*.md` 라인/토큰 예산을 유지
   - 코드에서 추론 가능한 일반론은 규칙에서 제거
4. TOC보다 소스 문서를 먼저 수정하고 링크를 갱신합니다.
5. 구조적 문서 변경 후 `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.

## 기본 문서 경로

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

상세 토큰/아카이브 정책은 `.claude/docs/guidelines/document-memory-policy.md`를 참고합니다.

## 참고

- 프로젝트 계약: `@.claude/PROJECT.md`
- 지식 저장소 운영: `@.claude/docs/guidelines/knowledge-repository-ops.ko.md`
- 토큰 최적화: `@.claude/docs/guidelines/token-optimization.ko.md`
- 에이전트 정의 규칙: `@.claude/rules/agents/agent-definition.md`
