---
name: codex-test-integration
description: Validate integration impact and regression risks via claude-delegator (Code Reviewer expert). Use for complex tasks or API integration.

---

# Codex Integration Validation (via claude-delegator)

## When to use
- `complexity`: `complex` (always)
- OR `apiSpecConfirmed == true && hasMockImplementation == true`
- Integration with external APIs
- Multi-component changes

## Procedure
1. Read the expert prompt file: `${CLAUDE_PLUGIN_ROOT}/prompts/code-reviewer.md`
2. Summarize change scope, endpoints, and integration points
3. Capture the context.md path (default: `{tasksRoot}/{feature-name}/context.md`) and read relevant code
4. Build delegation prompt using 7-section format (integration-focused)
5. **Try Codex first**:
   - Call `mcp__codex__codex` with Code Reviewer expert
   - If successful, proceed to step 7
6. **Fallback to Claude** (if Codex unavailable):
   - Error conditions: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude directly performs the integration review using the same 7-section prompt
   - Apply the code-reviewer.md expert instructions as Claude's own guidelines
   - Add note: `"codex-fallback: Claude performed integration review directly"`
7. Record regression risks and additional test scenarios
8. If a saved report is needed, store the full review in `{tasksRoot}/{feature-name}/archives/` and keep only a short summary in `context.md`

## Delegation Format

Use the 7-section format with integration focus:

```
TASK: Validate integration changes at [context.md path] for regression risks and contract compliance.

EXPECTED OUTCOME: Regression risk assessment with additional test scenarios.

CONTEXT:
- Integration to validate: [feature/API description]
- Changed files: [list of modified files]
- API endpoints affected:
  * [Endpoint 1: method, path, purpose]
  * [Endpoint 2: method, path, purpose]
- Integration points: [external systems, services, databases]

CONSTRAINTS:
- Must maintain backward compatibility
- Existing contracts must not break
- Technical stack: [languages, frameworks, API versions]

MUST DO:
- Identify regression risks across all integration points
- Verify contract compliance (request/response schemas)
- Check edge cases and error handling for each endpoint
- Assess performance implications of integration changes
- Identify missing test scenarios
- Check for proper error handling and retry logic

MUST NOT DO:
- Approve without checking all integration points
- Ignore backward compatibility concerns
- Skip edge case analysis

OUTPUT FORMAT:
Summary → Regression risks → Contract compliance → Edge cases → Performance concerns → Missing test scenarios → Additional tests needed
```

## Tool Call

```typescript
mcp__codex__codex({
  prompt: "[7-section delegation prompt with full context]",
  "developer-instructions": "[contents of code-reviewer.md]",
  sandbox: "read-only",  // Advisory mode - review only
  cwd: "[current working directory]"
})
```

## For Implementation Mode (Add Tests)

If you want the expert to implement missing tests:

```typescript
mcp__codex__codex({
  prompt: "[same 7-section format, but add: 'Implement the missing test scenarios identified']",
  "developer-instructions": "[contents of code-reviewer.md]",
  sandbox: "workspace-write",  // Implementation mode - can add test files
  cwd: "[current working directory]"
})
```

## Output (patch)
```yaml
notes:
  - "codex-integration: [PASS/FAIL], regression-risks=[count], extra-tests=[count]"
```
