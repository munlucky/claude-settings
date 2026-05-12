# 글로벌 지침

Last-Reviewed: 2026-05-12

`.claude/rules/`는 재귀 로드됩니다. 이 Tier 1 파일은 짧은 TOC로 유지합니다.

1. `AGENTS.md`와 이 파일은 TOC입니다.
2. 지속 정책은 `.claude/PROJECT.md`, `.claude/rules/`, `.claude/docs/guidelines/`에 둡니다.
3. 항상 로드되는 컨텍스트는 최소화하고 예산 아래로 유지합니다.
4. 소스 문서를 먼저 수정한 뒤 TOC 링크를 갱신합니다.
5. 구조 문서 변경 뒤 `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.
6. 런타임 계약은 `.claude/CLAUDE.md` + `.claude/verification.contract.yaml`입니다.

## 기본 문서 경로

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

## 참고

- `@.claude/CLAUDE.md`
- `@.claude/verification.contract.yaml`
- `@.claude/docs/guidelines/knowledge-repository-ops.md`
- `@.claude/docs/guidelines/provider-neutral-model-routing.md`
- `@.claude/docs/guidelines/resumable-session-layer.md`
- `@.claude/rules/agents/agent-definition.md`
