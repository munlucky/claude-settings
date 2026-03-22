---
name: completion-verifier
description: Verifies implementation completion by running acceptance tests and triggering retry loops when verification fails.
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
- `analysisContext.artifacts.verificationContractPath`
- Test framework and commands from `PROJECT.md` or verification contract
- `analysisContext.signals.allowIndeterminate` (boolean override, default: `true`)

## Contract-first policy

Prefer explicit verification contract data when available.

Order of precedence:
1. `.claude/verification.contract.yaml`
2. `PROJECT.md` Testing Rules
3. Filesystem/test-script auto-detection fallback

## Harness Gate Policy

- `verificationState: indeterminate` caused by missing executable verification remains `pass_with_warning` by default.
- In strict mode (`allowIndeterminate: false`), indeterminate is blocking.
- Missing verification contract:
  - standard profile -> continue with warning and fallback detection
  - strict profile -> expect `verification-contract-gate` to block earlier

## Step 0: Verification Environment Detection

Determine executable verification from the contract first.

```yaml
verificationEnvironment:
  contractDetected: true | false
  detected: false
  framework: null
  testCommand: null
  lintCommand: null
  buildCommand: null
  reason: null
```

Detection order:
- contract-defined commands
- `PROJECT.md` Testing Rules / commands
- config files and package scripts

## When Verification Environment is NOT Detected

```yaml
completionStatus:
  testEnvironment: false
  selfAuditOnly: true
  verificationState: indeterminate
  allPassed: null
  gateDecision: pass_with_warning | failed
  recommendation: "Add or refresh `.claude/verification.contract.yaml` for deterministic verification"
```

## Step 1: Run Acceptance Tests

Only when executable verification exists.

1. Parse Acceptance Tests section from `context.md`
2. Extract test IDs and file paths
3. Run tests using the contract-defined or detected command
4. Parse PASS/FAIL per test
5. Update `context.md` status column when appropriate

## Step 2: Self-Audit (Always Runs)

Compare results against `context.md` requirements even when automated verification is partial.

```yaml
selfAuditResult:
  requirementsMet: []
  requirementsNotMet: []
  boundaryCheck:
    neverDoViolations: []
    askFirstItems: []
    alwaysDoCompleted: []
  readyForTest: true | false
  blockers: []
```

## Output

```yaml
completionStatus:
  testEnvironment: true | false
  contractDetected: true | false
  selfAuditOnly: false
  allowIndeterminate: true | false
  verificationState: passed | failed | indeterminate
  gateDecision: pass | failed | pass_with_warning
  total: 5
  passed: 4
  failed: 1
  allPassed: false
  failedTests: []
  failedPhase: "Phase 1"
  recommendation: "Fix code or add explicit verification contract, then re-run"
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
```

## Retry Logic

When `verificationState: failed` and executable verification exists:
1. Identify failed phase
2. Add focused reproduction tests when practical
3. Return to implementation with failure details
4. Re-run verification
5. Retry max 2 times

## Skip Conditions

- No test framework configured -> self-audit only
- No Acceptance Tests in `context.md` -> self-audit only
- Missing verification contract in standard profile -> fallback detection allowed

## Notes

- Self-Audit supplements tests; it does not replace them.
- Requirement fulfillment involves judgment; verdict artifacts provide deterministic evidence.
- If `neverDoViolations` exist, halt immediately and report to user.
