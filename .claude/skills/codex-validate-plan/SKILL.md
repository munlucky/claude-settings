---
name: codex-validate-plan
description: Validate architecture/plan quality via Codex MCP. Use after writing context.md for complex feature/refactor work.
---

# Codex Plan Validation

## When to use
- `complexity`: `complex`
- `taskType`: `feature` or `refactor`
- `context.md` exists or was updated

## Procedure
1. Collect the contents of context.md.
2. Run the plan validation prompt via Codex MCP.
3. Summarize critical/warning/suggestion items and decide pass/fail.

## Prompt template
```
Please review the following implementation plan (context.md):

[context.md contents]

Validation items:
1. Architecture suitability and maintainability
2. Tech stack suitability
3. File/module boundaries
4. Performance risks
5. Security risks
6. Core technical risks

Output:
- Pass items
- Warnings
- Critical issues
```

## Output (patch)
```yaml
notes:
  - "codex-plan: pass, warnings=2"
```
