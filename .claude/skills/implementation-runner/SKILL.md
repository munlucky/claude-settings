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
- `analysisContext.artifacts.workflowGuidePath`
- `analysisContext.artifacts.designGuidePath`
- `analysisContext.artifacts.glossaryGuidePath`
- `analysisContext.artifacts.dailyGuidePath`
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- `analysisContext.artifacts.contextDocPath` (if present)
- `analysisContext.artifacts.planPath` / `taskSliceGlob` (if present)
- `analysisContext.artifacts.sprintContractPath` (when execution bridge is required)
- `analysisContext.artifacts.scorecardPath` (when execution bridge is required)

## Procedure

### Step 0: Project Reference Docs

Before code edits, load the applicable project reference docs when they exist:
- `workflow/README.md` for branch/worktree/process rules
- `docs/design/README.md` for shared UI and pattern rules
- `docs/glossary/README.md` for canonical naming
- `docs/daily/README.md` for logging expectations
- `TEST_GUIDE.md` for verification scope expectations
- relevant `docs/analysis/*.md` when the target area already has prior analysis

Rules:
- Prefer these docs over ad-hoc assumptions for naming, structure, testing, and workflow behavior.
- If a relevant doc is missing, record the absence in notes and continue with the best available contract instead of inventing policy.

### Step 0.1: Execution Bridge Setup

Before code edits, determine whether the current run requires a slice-level sprint contract.

Require contract setup when:
- `executionPlane == product_project`
- and `complexity != simple` or `artifacts.sprintContractPath` is already populated

If required:
1. Resolve the active slice from `PLAN.md`, `tasks/*.md`, or current notes
2. Create or refresh `SPRINT_CONTRACT.md`
3. Record:
   - round goal
   - explicit non-goals
   - done checks
   - evaluator focus
   - expected evidence
   - policy anchors (always-loaded rules, active workspace contract, verification contract, round-specific guides)
   - objective score checklist and target
4. If a safe contract cannot be derived, stop and return planning notes instead of guessing in code

Result:
```yaml
signals.sprintContractReady: true | false
notes:
  - "sprint-contract: ready, path=..."
  - "scorecard: ready, path=..."
```

### Step 1: Test Environment Detection

Before starting implementation, check if the target project has a test environment:

```yaml
testEnvironmentCheck:
  # Check for test config files
  configFiles:
    - "jest.config.*"
    - "vitest.config.*"
    - "playwright.config.*"
    - "pytest.ini"
    - "pyproject.toml [tool.pytest]"
  # Check package.json scripts.test
  packageJson: "scripts.test != default error message"
  # Check for existing test files
  testFiles: "**/*.test.* | **/*.spec.* | __tests__/ | tests/"

result:
  signals.testEnvironmentDetected: true | false
  signals.testFramework: "{detected}" | null
```

> When `testEnvironmentDetected = false`, skip test co-creation (Step 5) with warning.

### For All Tasks
1. Check requirements, context, and `SPRINT_CONTRACT.md` when present.
2. Check project reference docs relevant to the change when present.
3. Define change scope from the active slice and implement.
4. Record changed files and key change summary.
5. Update implementation completion in `analysisContext`.
6. **Write tests** (if `testEnvironmentDetected = true`, see Step 5).

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

### Step 5: Test Co-Creation

> **Only when `signals.testEnvironmentDetected = true`**

When implementing features, **write tests alongside code changes**:

```yaml
testCoCreation:
  # 1. Unit tests for new/changed functions
  unitTests:
    scope: "Each new or significantly modified function"
    naming: "{Component}.test.ts(x) or {module}.test.ts"
    minimum: 1 per feature

  # 2. Integration tests for user-facing flows
  integrationTests:
    scope: "Each new API endpoint or user flow"
    naming: "{feature}.integration.test.ts"
    minimum: 1 per flow (when applicable)
    
  # 3. Bug fix reproduction tests
  bugfixTests:
    scope: "Each bug being fixed"
    naming: "Include 'regression' or bug ID in test name"
    requirement: "Write reproduction test BEFORE fixing"
```

**When test env NOT detected:**
```yaml
action:
  - Log: "⚠️ No test environment. Skipping test co-creation."
  - Set signals.testsWritten = false
  - Continue to output
```

## Output (patch)
```yaml
signals.implementationComplete: true
signals.testEnvironmentDetected: true | false
signals.testsWritten: true | false
signals.sprintContractReady: true | false
signals.selfHealingAttempts: 2  # Number of auto-fix attempts
repo.changedFiles:
  - src/...
  - src/__tests__/...  # Test files included
notes:
  - "sprint-contract: ready, path=..."
  - "scorecard: ready, path=..."
  - "implementation: complete, changed_files=3, tests_written=2"
  - "refactor: scope_confirmed=true, phases=3, build_status=pass"
  - "self-healing: attempts=1, fixed=TS2339"  # For auto-fixed errors
  - "test-env: detected=true, framework=vitest"  # Or "test-env: not_detected"
```

## Rules
- Do not call other skills/subagents.
- If failed or deferred, record the reason in `notes`.
- When execution bridge is required, do not skip `SPRINT_CONTRACT.md`.
- When execution bridge is required, do not skip `SCORECARD.md`.
- For refactor tasks: always confirm scope before starting.
- Self-healing: max 2 retry attempts per phase before asking user.
- **Test co-creation**: When test environment exists, implementation without tests is incomplete.
