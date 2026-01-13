---
name: codex-validate-plan
description: claude-delegator(Plan Reviewer 전문가)를 통해 아키텍처/계획 품질을 검증합니다. 복잡한 기능/리팩터링 작업의 context.md 작성 후 사용하세요.

---

# Codex 계획 검증 (claude-delegator 사용)

## 사용 시점
- `complexity`: `complex`
- `taskType`: `feature` 또는 `refactor`
- `context.md`가 존재하거나 업데이트된 경우

## 절차
1. 전문가 프롬프트 파일 읽기: `${CLAUDE_PLUGIN_ROOT}/prompts/plan-reviewer.md`
2. context.md 경로를 수집하고 내용 읽기 (기본: `{tasksRoot}/{feature-name}/context.md`)
3. 7-섹션 형식으로 위임 프롬프트 구성
4. **Codex 먼저 시도**:
   - Plan Reviewer 전문가와 함께 `mcp__codex__codex` 호출
   - 성공 시 6단계로 진행
5. **Claude로 폴백** (Codex 사용 불가 시):
   - 에러 조건: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude가 동일한 7-섹션 프롬프트를 사용하여 직접 계획 검토 수행
   - plan-reviewer.md 전문가 지침을 Claude 자체 가이드라인으로 적용
   - 노트 추가: `"codex-fallback: Claude가 직접 검토 수행"`
6. 중대/경고/제안 항목을 요약하고 통과/실패 결정
7. **`.claude/docs/guidelines/document-memory-policy.md` 참조**: 전체 리뷰는 `archives/review-v{n}.md`에 보관하고 `context.md`에는 짧은 요약만 남김

## 위임 형식

7-섹션 형식 사용:

```
TASK: [context.md 경로]의 구현 계획을 완전성과 명확성을 기준으로 검토합니다.

EXPECTED OUTCOME: 구체적인 피드백이 포함된 APPROVE/REJECT 판정.

CONTEXT:
- 검토할 계획: [context.md의 내용]
- 목표: [계획이 달성하려는 목표]
- 제약사항: [프로젝트 제약사항]

MUST DO:
- 4가지 기준(명확성, 검증가능성, 완전성, 전체 그림) 모두 평가
- 실제 작업을 시뮬레이션하여 누락된 부분 찾기
- 거부 시 구체적인 개선사항 제공

MUST NOT DO:
- 실제 분석 없이 승인
- 모호한 피드백 제공
- 중대한 누락이 있는 계획 승인

OUTPUT FORMAT:
[APPROVE / REJECT]
정당화: [설명]
요약: [4가지 기준 평가]
[REJECT인 경우: 필요한 상위 3-5개 개선사항]
```

## 도구 호출

```typescript
mcp__codex__codex({
  prompt: "[전체 컨텍스트가 포함된 7-섹션 위임 프롬프트]",
  "developer-instructions": "[plan-reviewer.md의 내용]",
  sandbox: "read-only",  // Advisory 모드
  cwd: "[현재 작업 디렉터리]"
})
```

## 출력 (patch)
```yaml
notes:
  - "codex-plan: [APPROVE/REJECT], warnings=[개수]"
```
