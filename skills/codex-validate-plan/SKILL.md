---
name: codex-validate-plan
description: Runtime-adaptive plan validation skill (Plan Reviewer rubric). Use after writing context.md for complex feature/refactor work.
context: fork
---

# Codex Plan Validation (Runtime-adaptive)

## When to use
- `complexity`: `complex`
- `taskType`: `feature` or `refactor`
- `context.md` exists or was updated

## Inputs
- `analysisContext.*` (structured state)
- `context.md` (path: `analysisContext.artifacts.contextDocPath`)

## Runtime Adapter Policy

`executionRuntime` must be resolved before running this skill.

- `claude-code`: use `mcp__codex__codex` when available, then Claude fallback if needed.
- `codex`: run the same plan validation rubric directly in the current Codex session (native path), without `mcp__codex__codex` dependency.

## Procedure

### Step 1: Resolve Runtime Execution Path (CRITICAL - Do This First)
Determine runtime and select execution path:

- If runtime is `codex` -> skip MCP availability check and use Codex native path.
- If runtime is `claude-code` -> verify Codex MCP availability:

```typescript
// Try a simple MCP call to check availability
try {
  mcp__codex__codex({
    prompt: "ping",
    sandbox: "read-only",
    cwd: process.cwd()
  })
  // If successful, MCP is available
} catch (error) {
  // MCP not available - proceed with Claude fallback
}
```

**MCP Unavailable Conditions:**
- Tool not found / not registered
- "quota exceeded", "rate limit", "API error", "unavailable"
- Connection timeout
- Any error response

### Step 2-8: Validation Process

2. Collect the path to context.md (default: `{tasksRoot}/{feature-name}/context.md`) and read its content
3. Build delegation prompt using the 7-section format below

4. **If MCP is available (from Step 1)**:
   - Call `mcp__codex__codex` (include Plan Reviewer instructions in developer-instructions)
   - If successful, proceed to step 6

5. **If MCP is unavailable (from Step 1)**:
   - Claude directly performs the plan review following the Plan Reviewer guidelines below
   - Add note: `"codex-fallback: Claude performed review directly (MCP unavailable)"`
   - Follow the same MUST DO / MUST NOT DO criteria

6. **If runtime is `codex`**:
   - Run plan validation directly in the current Codex session using the same 7-section format and criteria
   - Add note: `"codex-native: plan validation executed in Codex runtime"`

7. Summarize critical/warning/suggestion items and decide pass/fail
8. **Per `docs/public/guidelines/document-memory-policy.md`**: Store full review in `archives/review-v{n}.md`, keep only short summary in `context.md`

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
- Reject plans that omit exact files, exact commands, expected fail/pass signals, blocker conditions, review checkpoints, or verification evidence paths
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

## Tool Call (Claude Code + MCP Available)

```typescript
mcp__codex__codex({
  prompt: "[7-section delegation prompt with full context]",
  "developer-instructions": "[contents of plan-reviewer.md]",
  sandbox: "read-only",  // Advisory mode
  cwd: "[current working directory]"
})
```

## Claude Fallback (Claude Code + MCP Unavailable)

When MCP is not available, Claude performs the validation directly:

1. Apply the same 7-section format as a self-review checklist
2. Evaluate all 4 criteria:
   - **Clarity**: Are the goals and steps clearly defined?
   - **Verifiability**: Can success be measured objectively with exact commands and evidence paths?
   - **Completeness**: Are exact files, expected signals, blockers, review checkpoints, and evidence paths included?
   - **Big Picture**: Does it align with overall architecture?
3. Output in the same format: APPROVE/REJECT with justification
4. Add note indicating fallback mode was used

## Codex Native Path (When runtime=codex)

When running in Codex runtime, execute plan validation directly:

1. Apply the same 7-section format as the validation checklist
2. Evaluate all 4 criteria (Clarity, Verifiability, Completeness, Big Picture)
   - Reject if exact files, commands, fail/pass signals, blocker conditions, review checkpoints, or evidence paths are missing.
3. Output in the same format: APPROVE/REJECT with justification
4. Add note: `"codex-native: plan validation executed in Codex runtime"`

## Output (patch)
```yaml
notes:
  - "codex-plan: [APPROVE/REJECT], warnings=[count]"
  # If fallback was used:
  - "codex-fallback: Claude performed review directly (MCP unavailable)"
  # If Codex runtime native path was used:
  - "codex-native: plan validation executed in Codex runtime"
```
