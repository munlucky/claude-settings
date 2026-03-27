# 글로벌 개발 지침

> 항상 로드되는 TOC 문서입니다. 짧게 유지합니다.

Last-Reviewed: 2026-03-26

## 개요

`.claude/rules/`는 재귀 로드됩니다. 이 문서는 Tier-1 제약만 담습니다.

## Tier-1 제약

1. `AGENTS.md`와 이 문서는 TOC이며, 전체 정책 저장소가 아닙니다.
2. 지속 정책은 아래 소스 오브 트루스에 둡니다.
   - `.claude/PROJECT.md` (프로젝트 계약)
   - `.claude/rules/` (강제 규칙)
   - `.claude/docs/guidelines/` (절차)
3. 항상 로드되는 컨텍스트는 최소화합니다.
   - `.claude/rules/**/*.md`는 라인/토큰 예산을 유지
   - 코드에서 추론 가능한 일반론은 제거
4. TOC보다 소스 문서를 먼저 수정하고 링크를 갱신합니다.
5. 구조 문서 변경 뒤 `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.

## 기본 문서 경로

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

토큰/아카이브 정책은 `.claude/docs/guidelines/document-memory-policy.md`를 참고합니다.

## Runtime Note

- 실제 제품 작업은 활성 워크스페이스의 `PROJECT.md` 와 `.claude/verification.contract.yaml`을 런타임 계약으로 사용합니다.
- 이 저장소의 `.claude/PROJECT.md`는 설치 대상 프로젝트용 템플릿입니다.
- Claude Code 와 Codex 모두에서 코드 작업의 정책 경계는 `moonshot-orchestrator`입니다.

## 참고

- 프로젝트 계약: `@.claude/PROJECT.md`
- 검증 계약: `@.claude/verification.contract.yaml`
- 지식 저장소 운영: `@.claude/docs/guidelines/knowledge-repository-ops.ko.md`
- 에이전트 정의 규칙: `@.claude/rules/agents/agent-definition.md`
