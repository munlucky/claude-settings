---
name: codex-review-code
description: Runtime-adaptive code review for implementation quality and regression risks (Code Reviewer rubric). Use after implementation for complex tasks, refactors, or API changes.
context: fork
---

# Codex Code Review (Runtime-adaptive)

## When to use
- After implementation for complex tasks
- Refactoring work
- API changes
- Before merging significant changes

## Inputs
- `analysisContext.*` (structured state)
- `context.md` (path: `analysisContext.artifacts.contextDocPath`)

## Runtime Adapter Policy

`executionRuntime` must be resolved before running this skill.

- `claude-code`: use `mcp__codex__codex` when available, then Claude fallback if needed.
- `codex`: run the same review rubric directly in the current Codex session (native path), without `mcp__codex__codex` dependency.

## Policy Boundary

- Treat `.claude/scripts/verify-code-policy.sh` as the hard gate for machine-checkable code policy violations.
- Use this review for semantic and architectural risk assessment, not as a substitute for deterministic checks.
- Repeat code-policy findings only when they expose a broader design or maintainability problem.

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

### Step 2-9: Review Process

2. Summarize change scope, changed files, and key behaviors
3. Capture the context.md path (default: `{tasksRoot}/{feature-name}/context.md`) and read relevant code
4. Build delegation prompt using the 7-section format below

5. **If MCP is available (from Step 1)**:
   - Call `mcp__codex__codex` (include Code Reviewer instructions in developer-instructions)
   - If successful, proceed to step 7

6. **If MCP is unavailable (from Step 1)**:
   - Claude directly performs code review following the Code Reviewer guidelines below
   - Add note: `"codex-fallback: Claude performed review directly (MCP unavailable)"`
   - Follow the same MUST DO / MUST NOT DO criteria

7. **If runtime is `codex`**:
   - Run the review directly in the current Codex session using the same 7-section format and criteria
   - Add note: `"codex-native: review executed in Codex runtime"`

8. Record critical issues, warnings, and suggestions
9. **Per `.claude/docs/guidelines/document-memory-policy.md`**: Store full review in `archives/review-v{n}.md`, keep only short summary in `context.md`

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
- **Security Checks (CRITICAL)**:
  * Hardcoded credentials (API keys, passwords, tokens)
  * SQL injection risks (string concatenation in queries)
  * XSS vulnerabilities (unescaped user input)
  * Missing input validation
- **Code Quality (HIGH)**:
  * Long functions (>50 lines)
  * Deep nesting (>4 levels)
  * Missing error handling (try/catch)
  * Repeated or systemic policy violations that indicate weak module boundaries
- **React/Next.js Performance (CRITICAL)** [if signals.reactProject]:
  * Sequential await instead of Promise.all() (waterfall pattern)
  * Barrel file imports (`import { X } from 'lib'` → direct import)
  * Missing dynamic imports for heavy components
  * RSC serialization: passing entire objects instead of needed fields
  * Missing Suspense boundaries for async components
  Reference: `.claude/skills/vercel-react-best-practices/SKILL.md`
- Focus on issues that matter, not style nitpicks
- Check logic/flow errors and edge cases
- Validate type safety and error handling
- Verify API contract and data model consistency

MUST NOT DO:
- Nitpick style (let formatters handle this)
- Flag theoretical concerns unlikely to matter
- Suggest changes outside the scope of modified files

OUTPUT FORMAT:
Summary → Critical issues → Warnings → Recommendations → Verdict

## Approval Criteria (Fix Forward Policy)

- ✅ **APPROVE**: No issues
- ⚠️ **FIX-FORWARD**: HIGH issues → merge allowed + follow-up task 생성
- ⚠️ **MERGE-NOTE**: MEDIUM issues → merge allowed + notes 기록
- ❌ **REJECT**: CRITICAL issues only (보안/데이터 무결성)
```

## Tool Call (Claude Code + MCP Available)

```typescript
mcp__codex__codex({
  prompt: "[7-section delegation prompt with full context]",
  "developer-instructions": "[contents of code-reviewer.md]",
  sandbox: "read-only",  // Advisory mode - review only
  cwd: "[current working directory]"
})
```

## Claude Fallback (Claude Code + MCP Unavailable)

When MCP is not available, Claude performs the review directly:

1. Apply the same 7-section format as a self-review checklist
2. Follow all MUST DO / MUST NOT DO criteria
3. Output in the same format: Summary → Critical issues → Warnings → Recommendations → Verdict
4. Add note indicating fallback mode was used

## Codex Native Path (When runtime=codex)

When running in Codex runtime, execute review directly:

1. Apply the same 7-section format as the review checklist
2. Follow all MUST DO / MUST NOT DO criteria
3. Output in the same format: Summary -> Critical issues -> Warnings -> Recommendations -> Verdict
4. Add note: `"codex-native: review executed in Codex runtime"`

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

For `runtime=codex`, run the same fix instructions directly in the current session with workspace-write permissions and the same verification requirements.

## Output (patch)
```yaml
notes:
  - "codex-review: [APPROVE/FIX-FORWARD/MERGE-NOTE/REJECT], critical=[count], high=[count], warnings=[count]"
  # If fallback was used:
  - "codex-fallback: Claude performed review directly (MCP unavailable)"
  # If Codex runtime native path was used:
  - "codex-native: review executed in Codex runtime"

# Fix Forward Tasks (HIGH issues that allow merge with follow-up)
fixForward:
  tasks:
    - issue: "Long function in paymentService.ts (62 lines)"
      severity: HIGH
      file: "src/services/paymentService.ts"
      suggestion: "Extract coupon validation to separate function"
    # empty if no HIGH issues
```

## Review-Fix Loop (Auto-Fix Mode)

### Workflow

1. **Run codex-review-code**
2. **Analyze result:**
   - `APPROVE` → Proceed to next step
   - `FIX-FORWARD (HIGH issues)` → Merge allowed, create follow-up tasks in `fixForward.tasks[]`
   - `MERGE-NOTE (MEDIUM issues)` → Merge allowed, record in notes
   - `REJECT (CRITICAL issues)` → Enter Auto-Fix Loop
3. **Auto-Fix Loop (CRITICAL only):**
   - Re-invoke with `sandbox: "workspace-write"`
   - Include fix instructions in prompt
   - Run verification after fix
4. **Loop limit:** Max 2 retries
5. **After 2 failures:** Request user confirmation

### Configuration

```yaml
reviewFixLoop:
  enabled: true
  maxRetries: 2
  fixableIssues:
    - console.log statements
    - missing error handling
    - type errors
    - simple security issues (hardcoded strings)
  nonFixableIssues:
    - architectural changes
    - breaking API changes
    - complex security vulnerabilities
```

### Auto-Fix Prompt Addition

When entering fix mode, add to prompt:
```
Fix the following issues and verify the changes:
1. [Issue description from review]
2. [Issue description from review]

After fixing, run verification to confirm the issues are resolved.
```
