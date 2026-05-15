---
name: context-readiness-gate
description: downstream 작업의 최소 context 계약을 확인하고, 부족하면 context-builder로 연결합니다.
---

# Context Readiness Gate

## 역할
최소한의 `context.md` 없이 downstream 구현이 시작되지 않도록 막습니다.

## 사용 시점
- `executionPlane == product_project`
- `implementation-runner` 이전

## 입력
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.contextReady`
- `analysisContext.artifacts.contextDocPath`

## 최소 context 섹션
- `Goal`
- `Constraints`
- `Acceptance Criteria`
- `Out of Scope`
- `Target Files`
- `Verification Plan`

## 게이트 로직
1. `executionPlane != product_project`이면 통과 메모만 남깁니다.
2. `contextReady == true`이면 통과합니다.
3. 그렇지 않으면:
   - 워크플로우를 planning에 유지합니다.
   - `context-builder`를 권장하거나 자동 주입합니다.
   - 어떤 최소 섹션이 없는지 기록합니다.

## 출력 예시
```yaml
notes:
  - "context-readiness-gate: blocked -> run context-builder"
missingInfo:
  - category: task-context
    priority: HIGH
    question: "최소 context schema를 만족하는 `{tasksRoot}/{feature-name}/context.md`를 생성하세요."
decisions:
  recommendedAgents:
    - context-builder
```

## 규칙
- 이 게이트는 정책 검사만 수행합니다.
- 정확한 섹션 계약은 `.claude/docs/guidelines/context-readiness-schema.ko.md`를 참고합니다.
