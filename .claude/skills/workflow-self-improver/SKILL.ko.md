---
name: workflow-self-improver
description: failure-analyzer의 개선안을 시스템 프롬프트, 규칙, 가이드, 스킬 정의에 반영한다.
context: fork
status: deprecated
surfaceStatus: deprecated
---

# Workflow Self-Improver 스킬

## 상태

기본 실행 경로에서는 deprecated 처리합니다.
메타 워크플로우 수정은 사람 검토가 필요하므로 명시적 유지보수 검토 도구로만 사용합니다.
기본 stage bundle이나 공개 진입점 목록에 포함하지 않습니다.

## 목적
실패 분석 결과를 바탕으로 메타 시스템을 안전하게 개선한다.

## 입력
- `systemImprovements.projectSpecific`
- `systemImprovements.universal`

## 적용 범위
- `.claude/PROJECT.md`
- `.claude/rules/*.md`
- `.claude/CLAUDE.md`
- `.claude/docs/guidelines/*.md`
- gate/orchestrator 스킬 변경은 제안 전용

## 안전 규칙
1. 소스 코드는 수정하지 않는다.
2. 변경 전 백업한다.
3. YAML/문서 유효성을 확인한다.
4. `SKILL.md` 로직 변경은 항상 수동 리뷰 대상이다.
5. gate 정의와 orchestrator 라우팅 변경도 자동 적용 금지다.

## 출력 예시

```yaml
selfImprovementResult:
  applied:
    - file: ".claude/rules/workflow.md"
      change: "라우팅 정책 설명 보강"
  pendingApproval:
    - file: ".claude/skills/moonshot-orchestrator/SKILL.md"
      change: "execution plane 로직 변경"
      reason: "스킬 로직 변경은 수동 리뷰 필요"
```
