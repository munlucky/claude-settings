---
name: completion-verifier
description: Verifies implementation completion by running acceptance tests and triggers retry loop on failure.
context: fork
---

# Completion Verifier Skill

## When to Use

- After each implementation phase
- Before marking task as complete
- When retry loop is triggered

## Inputs

- `analysisContext.*` (structured state)
- `context.md` (path: `analysisContext.artifacts.contextDocPath`, contains Acceptance Tests)
- Test framework (from PROJECT.md: jest/vitest/agent-browser/playwright)
- `analysisContext.signals.allowIndeterminate` (boolean override, default: `true`)

## Harness Gate Policy

- `verificationState: indeterminate` caused by missing test environment is handled as `pass_with_warning` by default.
- In strict mode (`allowIndeterminate: false`), indeterminate is blocking.
- `allowIndeterminate: true`:
  - Default operating mode; proceed with warning and follow-up actions.

## Step 0: Test Environment Detection

> **CRITICAL**: Before running any tests, detect whether the target project has a test environment.

### Detection Logic

```yaml
testEnvironment:
  detected: false
  framework: null      # jest | vitest | agent-browser | playwright | cypress | mocha | pytest | go-test | bats | null
  configFile: null
  testCommand: null
  reason: null

detection:
  # 1. Check PROJECT.md for explicit test config
  - source: "PROJECT.md → Testing Rules"
    check: "Test framework field is filled in"
    
  # 2. Check for test config files
  - source: "filesystem"
    patterns:
      - "jest.config.*"
      - "vitest.config.*"
      - "playwright.config.*"
      - "cypress.config.*"
      - ".mocharc.*"
      - "pytest.ini"
      - "setup.cfg [tool:pytest]"
      - "pyproject.toml [tool.pytest]"
      - "*_test.go"
      
  # 3. Check package.json for test script
  - source: "package.json"
    check: "scripts.test exists AND scripts.test != 'echo \"Error: no test specified\" && exit 1'"

  # 4. Check for existing test files
  - source: "filesystem"
    patterns:
      - "**/*.test.ts"
      - "**/*.test.tsx"
      - "**/*.test.js"
      - "**/*.spec.ts"
      - "**/*.spec.js"
      - "__tests__/**"
      - "tests/**"
      - "test/**"
```

### When Test Environment NOT Detected

```yaml
action:
  1. Set signals.testEnvironmentDetected = false
  2. Log warning: "⚠️ No test environment detected. Skipping automated test verification."
  3. Fall through to Self-Audit only (Step 2)
  4. Return:
     completionStatus:
       testEnvironment: false
       selfAuditOnly: true
       verificationState: indeterminate
       allPassed: null  # Cannot determine
       gateDecision: pass_with_warning | failed
       # decision rule:
       # - allowIndeterminate=true  -> pass_with_warning
       # - allowIndeterminate=false -> failed
       recommendation: "Consider setting up a test framework for automated verification"
```

### When Test Environment IS Detected

```yaml
action:
  1. Set signals.testEnvironmentDetected = true
  2. Set signals.testFramework = "{detected framework}"
  3. Set signals.testCommand = "{detected command}"
  4. Proceed to Step 1 (full test verification)
```

## Step 1: Run Acceptance Tests

> Only executes when `testEnvironmentDetected = true`

1. Parse Acceptance Tests section from context.md
2. Extract test IDs and file paths
3. Run tests using detected command:
   ```bash
   # Default (npm-based)
   npm test -- --testPathPattern="{test files}"
   
   # Or use PROJECT.md configured command
   {testCommand}
   ```
4. Parse results (PASS/FAIL per test)
5. Update context.md status column

### Integration Test Verification

After unit tests pass, verify user-facing flows:

```yaml
integrationVerification:
  # 1. Identify user flows from context.md
  flows:
    - name: "{flow description from requirements}"
      type: integration | e2e
      testFiles: ["{related test files}"]
  
  # 2. Run integration tests if they exist
  command: |
    npm test -- --testPathPattern="integration|e2e"
    
  # 3. If no integration tests exist but should
  missingIntegrationTests:
    action: "Report as incomplete, recommend writing integration tests"
    severity: "WARN"  # Not blocking, but noted
```

## Step 2: Self-Audit (Always Runs)

> Runs regardless of test environment availability.

After implementation, compare results against context.md requirements:

> "After implementation, compare your results against the requirements in context.md 
> and verify each item is fulfilled. 
> If any requirements are not met, list them."

### Self-Audit Output Format

```yaml
selfAuditResult:
  # Requirements fulfillment
  requirementsMet:
    - "[REQ-1] User query API ✅"
    - "[REQ-2] Error handling ✅"
  requirementsNotMet:
    - "[REQ-3] Pagination ❌ (not implemented)"
  
  # 3-tier boundary check
  boundaryCheck:
    neverDoViolations: []          # Critical violations (halt if any)
    askFirstItems: []              # Items needing approval
    alwaysDoCompleted:             # Required actions
      - "lint executed"
      - "tests passed"
  
  # Overall judgment
  readyForTest: true | false
  blockers:                        # Blocking reasons if false
    - "REQ-3 not implemented"
```

## Output

```yaml
completionStatus:
  testEnvironment: true | false
  selfAuditOnly: false
  allowIndeterminate: true | false
  verificationState: passed | failed | indeterminate
  gateDecision: pass | failed | pass_with_warning
  total: 5
  passed: 4
  failed: 1
  allPassed: false
  failedTests:
    - id: T2
      type: Unit  # or Integration
      file: ErrorHandler.test.tsx
      error: "Expected error message not shown"
  failedPhase: "Phase 1"  # Determines where to retry
  recommendation: "Fix ErrorHandler.tsx, then re-run Phase 1"
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
```

### verificationState contract

- `passed`: tests ran and gate passed (`allPassed: true`)
- `failed`: tests ran and failed (`allPassed: false`)
- `indeterminate`: no executable test environment (typically `allPassed: null`, Self-Audit only)
- With `allowIndeterminate=true` (default), continue as `pass_with_warning`.
- With `allowIndeterminate=false`, treat indeterminate as blocking.

## Retry Logic

When `verificationState: failed` AND `testEnvironment: true`:

1. **Identify failed phase** based on test type:
   - Unit FAIL → Phase 1 (Mock implementation)
   - Integration FAIL → Phase 2 (API integration)

2. **Add unit test for the failure** (if not already exists):
   - Create a focused reproduction test for the specific failure
   - This ensures the bug is captured as a regression test
   
3. **Return to failed phase** (NOT test rewriting):
   - Pass `failedTests` info to implementation-agent
   - Implementation-agent fixes code only (no existing test rewrite)
   
4. **Re-run verification**:
   - Run the new unit test to confirm the fix
   - Run full test suite to verify no regressions

5. **Retry limits**:
   - Max 2 retries per phase
   - After 2 failures → Ask user for intervention

## Skip Conditions

- No test framework configured → **Self-Audit only** (not full skip)
- No Acceptance Tests in context.md → Self-Audit only
- Skip Conditions from testing.md apply (legacy, prototype, etc.)

## Workflow

```
Implementation Phase Complete
        ↓
[Step 0] Test Environment Detection
        ↓
    detected?
     ↓         ↓
   true      false
     ↓         ↓
[Step 1]   [Step 2 only]
Run tests    Self-Audit
     ↓         ↓
[Step 2]   Return status
Self-Audit   (selfAuditOnly: true)
     ↓
  allPassed?
   ↓      ↓
  true   false
   ↓      ↓
 Done   Add unit test → Fix → Retry
```

## Tool Call Example

```bash
# Run specific tests
npm test -- --testPathPattern="batch.test|ErrorHandler.test"

# Check coverage (optional)
npm test -- --coverage --testPathPattern="..."
```

### Notes

- Self-Audit is a **supplementary check**, not a replacement for actual tests
- Requirement fulfillment involves subjective judgment; tests provide final verification
- If `neverDoViolations` exist, halt immediately and report to user
- When test env is missing, Self-Audit provides minimum viable verification
