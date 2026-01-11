---
name: codex-review-code
description: Review implementation quality and regression risks via Codex CLI (context: fork). Use after implementation for complex tasks, refactors, or API changes.
context: fork
---

# Codex Code Review

## Procedure
1. Summarize change scope, changed files, and key behaviors, and capture the context.md path.
2. Run the review prompt via Codex CLI (pass the prompt directly) with `context: fork` in the background.
3. Record critical issues, warnings, and suggestions.

## Prompt template
```
context: fork
Please review the implementation at this path (context.md):
- [context.md path]

Summary:

- Feature summary
- Changed files
- Key behaviors

Checklist:
1. Logic/flow errors and missing edge cases
2. Type safety and error handling
3. API contract and data model consistency
4. Performance/resource waste
5. Security/auth/input validation
6. Project conventions and maintainability

Output:
- Pass items
- Warnings
- Critical issues
```

## Output (patch)
```yaml
notes:
  - "codex-review: pass, warnings=2"
```
