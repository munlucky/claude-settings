---
name: implementation-runner
description: Performs implementation in the chain and records completion state and changed files in analysisContext. Use during implementation.
---

# Implementation Runner

## Inputs
- `analysisContext.request.userMessage`
- `analysisContext.request.taskType`
- `analysisContext.decisions.skillChain`
- `analysisContext.repo.openFiles`
- `analysisContext.artifacts.contextDocPath` (if present)

## Procedure

### For All Tasks
1. Check requirements and context.
2. Define change scope and implement.
3. Record changed files and key change summary.
4. Update implementation completion in `analysisContext`.

### For Refactor Tasks (taskType == refactor)
> Reference: `.claude/rules/scope-confirmation.md`, `.claude/rules/refactoring-guidelines.md`

**1. Scope Confirmation (Required)**
Before starting:
- Confirm IN SCOPE packages/modules
- Confirm OUT OF SCOPE items (API routes, DB schemas, etc.)
- If scope unclear, ask user for clarification

**2. Baseline Error Capture**
```bash
npm run build 2>&1 | tee /tmp/baseline-errors.log
```

**3. Phased Execution**
For complex refactoring, break into phases:
1. Complete each phase fully
2. Run build verification after each phase:
   ```bash
   npx tsc --noEmit --pretty
   ```
3. Report pass/fail status
4. Proceed only when build passes

**4. Error Separation**
- Document pre-existing errors (from baseline)
- Document only NEW errors introduced by refactoring

**5. Scope Lock**
If need to touch OUT OF SCOPE items:
- Stop and ask user for permission
- Record decision in notes

**6. Self-Healing Loop** (자동 빌드 오류 수정)
When build fails during refactoring:
```
retryCount = 0
maxRetries = 2

while (build fails AND retryCount < maxRetries):
  1. Analyze build error output
  2. Apply fix (reference: build-error-resolver patterns)
  3. Re-run build verification
  4. retryCount++

if (still failing after maxRetries):
  - Stop and report to user
  - List all attempted fixes
  - Ask for intervention
```

This enables autonomous error resolution without user intervention for common issues.

## Output (patch)
```yaml
signals.implementationComplete: true
signals.selfHealingAttempts: 2  # Number of auto-fix attempts
repo.changedFiles:
  - src/...
notes:
  - "implementation: complete, changed_files=3"
  - "refactor: scope_confirmed=true, phases=3, build_status=pass"
  - "self-healing: attempts=1, fixed=TS2339"  # For auto-fixed errors
```

## Rules
- Do not call other skills/subagents.
- If failed or deferred, record the reason in `notes`.
- For refactor tasks: always confirm scope before starting.
- Self-healing: max 2 retry attempts per phase before asking user.

