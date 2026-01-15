---
name: codex-review-code
description: Review implementation quality and regression risks via claude-delegator (Code Reviewer expert). Use after implementation for complex tasks, refactors, or API changes.
context: fork
---

# Codex Code Review (via claude-delegator)

## When to use
- After implementation for complex tasks
- Refactoring work
- API changes
- Before merging significant changes

## Procedure
1. Summarize change scope, changed files, and key behaviors
2. Capture the context.md path (default: `{tasksRoot}/{feature-name}/context.md`) and read relevant code
3. Build delegation prompt using the 7-section format below
4. **Try Codex first**:
   - Call `mcp__codex__codex` (include Code Reviewer instructions in developer-instructions)
   - If successful, proceed to step 6
5. **Fallback to Claude** (if Codex unavailable):
   - Error conditions: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude directly performs code review following the Code Reviewer guidelines below
   - Add note: `"codex-fallback: Claude performed review directly"`
6. Record critical issues, warnings, and suggestions
7. **Per `.claude/docs/guidelines/document-memory-policy.md`**: Store full review in `archives/review-v{n}.md`, keep only short summary in `context.md`

## Delegation Format

Use the 7-section format:

```
TASK: Review implementation at [context.md path] for [focus areas: correctness, security, performance, maintainability].

EXPECTED OUTCOME: Issue list with verdict and recommendations.

CONTEXT:
- Code to review: [file paths or snippets]
- Purpose: [what this code does]
- Recent changes:
  * [Changed files list]
  * [Key behaviors summary]
- Feature summary: [brief description]

CONSTRAINTS:
- Project conventions: [existing patterns to follow]
- Technical stack: [languages, frameworks]

MUST DO:
- Prioritize: Correctness → Security → Performance → Maintainability
- Focus on issues that matter, not style nitpicks
- Check logic/flow errors and edge cases
- Validate type safety and error handling
- Verify API contract and data model consistency

MUST NOT DO:
- Nitpick style (let formatters handle this)
- Flag theoretical concerns unlikely to matter
- Suggest changes outside the scope of modified files

OUTPUT FORMAT:
Summary → Critical issues → Warnings → Recommendations → Verdict (APPROVE/REJECT)
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

## For Implementation Mode (Auto-fix)

If you want the expert to fix issues automatically:

```typescript
mcp__codex__codex({
  prompt: "[same 7-section format, but add: 'Fix the issues found and verify the changes']",
  "developer-instructions": "[contents of code-reviewer.md]",
  sandbox: "workspace-write",  // Implementation mode - can modify files
  cwd: "[current working directory]"
})
```

## Output (patch)
```yaml
notes:
  - "codex-review: [APPROVE/REJECT], critical=[count], warnings=[count]"
```
