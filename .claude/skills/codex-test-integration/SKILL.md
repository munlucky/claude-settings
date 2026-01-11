---
name: codex-test-integration
description: Validate integration impact and regression risks via code-review . Use for complex tasks or API integration.

---

# Codex Integration Validation

## When to use
- `complexity`: `complex` (always)
- or `apiSpecConfirmed == true && hasMockImplementation == true`

## Procedure
1. Summarize change scope and endpoints, and capture the context.md path.
2. Run the integration validation prompt via code-review (pass the prompt directly) with `` in the background.
3. Record regression risks and extra test items.

## Prompt template
```

Please validate the integration changes at this path (context.md):
- [context.md path]

Context summary:
- Feature summary
- Changed files
- API endpoints

Checklist:
1. Regression risks
2. Contract compliance
3. Edge cases
4. Performance issues
5. Missing scenarios

Output:
- Pass items
- Additional tests
- Regression risks
```

## Output (patch)
```yaml
notes:
  - "codex-integration: pass, extra-tests=2"
```
