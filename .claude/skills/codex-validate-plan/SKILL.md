---
name: codex-validate-plan
description: Validate architecture/plan quality via claude-delegator (Plan Reviewer expert). Use after writing context.md for complex feature/refactor work.
context: fork
---

# Codex Plan Validation (via claude-delegator)

## When to use
- `complexity`: `complex`
- `taskType`: `feature` or `refactor`
- `context.md` exists or was updated

## Procedure
1. Read the expert prompt file: `${CLAUDE_PLUGIN_ROOT}/prompts/plan-reviewer.md`
2. Collect the path to context.md (default: `{tasksRoot}/{feature-name}/context.md`) and read its content
3. Build delegation prompt using 7-section format
4. **Try Codex first**:
   - Call `mcp__codex__codex` with Plan Reviewer expert
   - If successful, proceed to step 6
5. **Fallback to Claude** (if Codex unavailable):
   - Error conditions: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude directly performs the plan review using the same 7-section prompt
   - Apply the plan-reviewer.md expert instructions as Claude's own guidelines
   - Add note: `"codex-fallback: Claude performed review directly"`
6. Summarize critical/warning/suggestion items and decide pass/fail
7. **Per `.claude/docs/guidelines/document-memory-policy.md`**: Store full review in `archives/review-v{n}.md`, keep only short summary in `context.md`

## Delegation Format

Use the 7-section format:

```
TASK: Review implementation plan at [context.md path] for completeness and clarity.

EXPECTED OUTCOME: APPROVE/REJECT verdict with specific feedback.

CONTEXT:
- Plan to review: [content of context.md]
- Goals: [what the plan is trying to achieve]
- Constraints: [project constraints]

MUST DO:
- Evaluate all 4 criteria (Clarity, Verifiability, Completeness, Big Picture)
- Simulate actually doing the work to find gaps
- Provide specific improvements if rejecting

MUST NOT DO:
- Rubber-stamp without real analysis
- Provide vague feedback
- Approve plans with critical gaps

OUTPUT FORMAT:
[APPROVE / REJECT]
Justification: [explanation]
Summary: [4-criteria assessment]
[If REJECT: Top 3-5 improvements needed]
```

## Tool Call

```typescript
mcp__codex__codex({
  prompt: "[7-section delegation prompt with full context]",
  "developer-instructions": "[contents of plan-reviewer.md]",
  sandbox: "read-only",  // Advisory mode
  cwd: "[current working directory]"
})
```

## Output (patch)
```yaml
notes:
  - "codex-plan: [APPROVE/REJECT], warnings=[count]"
```
