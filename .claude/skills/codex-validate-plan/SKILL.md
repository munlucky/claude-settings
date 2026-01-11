---
name: codex-validate-plan
description: Validate architecture/plan quality via Codex CLI (context: fork). Use after writing context.md for complex feature/refactor work.
context: fork
---

# Codex Plan Validation

## When to use
- `complexity`: `complex`
- `taskType`: `feature` or `refactor`
- `context.md` exists or was updated

## Procedure
1. Collect the path to context.md.
2. Run the plan validation prompt via Codex CLI (pass the prompt directly) with `context: fork` in the background.
3. Summarize critical/warning/suggestion items and decide pass/fail.

## Prompt template
```
Please review the implementation plan at this path (context.md):

[context.md path]

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
