# Scope Confirmation Rules

> Always confirm scope boundaries before starting implementation work.

## Pre-Implementation Checklist

Before starting any implementation task:

1. **Confirm IN SCOPE**
   - Which packages/modules/files are included?
   - Which features or functionality should be modified?

2. **Confirm OUT OF SCOPE**
   - Which packages/modules should NOT be touched?
   - Are API routes excluded unless explicitly requested?
   - Are database schemas/migrations excluded?

3. **Confirm Workflow**
   - Is there a specific skill or orchestrator to use?
   - If a custom skill exists for this task type, use it immediately

## When to Apply

- Feature implementation
- Refactoring tasks
- Multi-file changes
- Cross-package modifications

## Example Scope Confirmation

Before implementing, ask:
```
스코프 확인:
- IN SCOPE: [packages/files to modify]
- OUT OF SCOPE: [packages/files to NOT touch]
- API 라우트 수정 필요 여부: 예/아니오
- 사용할 워크플로우: [skill name or default]
```
