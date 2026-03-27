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
- `analysisContext.artifacts.sprintContractPath`
- `analysisContext.artifacts.qaReportPath`
- `analysisContext.artifacts.handoffPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- Test framework and commands from `TEST_GUIDE.md`, `PROJECT.md`, or verification contract
- `analysisContext.signals.allowIndeterminate` (boolean override, default: `true`)

## Contract-first policy

Prefer explicit verification contract data when available.

Order of precedence:
1. `.claude/verification.contract.yaml`
2. `TEST_GUIDE.md`
3. `PROJECT.md` Testing Rules
4. Filesystem/test-script auto-detection fallback

Applicability rule:
- If the contract declares `scope`, apply required checks only when the current execution plane or changed paths match that scope.
- When the contract exists but does not apply to the current scope, fall back to the active workspace contract or detection rules instead of forcing unrelated required checks.

## Harness Gate Policy

- `verificationState: indeterminate` caused by missing executable verification remains `pass_with_warning` by default.
- In strict mode (`allowIndeterminate: false`), indeterminate is blocking.
- Missing verification contract:
  - standard profile -> continue with warning and fallback detection
  - strict profile -> expect `verification-contract-gate` to block earlier
- When a verification contract is present, do not return a passing completion verdict unless fresh evidence exists for the contract-defined required checks.

## Step 0: Verification Environment Detection

Determine executable verification from the contract first.

```yaml
verificationEnvironment:
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
  detected: false
  framework: null
  testCommand: null
  lintCommand: null
  buildCommand: null
  reason: null
```

Detection order:
- contract-defined commands
- `TEST_GUIDE.md` command matrix and scope rules
- `PROJECT.md` Testing Rules / commands
- config files and package scripts

## When Verification Environment is NOT Detected

```yaml
completionStatus:
  testEnvironment: false
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
  selfAuditOnly: true
  verificationState: indeterminate
  evidenceFresh: false
  allPassed: null
  gateDecision: pass_with_warning | failed
  recommendation: "Add or refresh `.claude/verification.contract.yaml` for deterministic verification"
```

## Step 1: Run Acceptance Tests

Only when executable verification exists.

1. Parse Acceptance Tests from `context.md` and done checks from `SPRINT_CONTRACT.md` when present
2. Extract test IDs and file paths
3. Run the contract-defined required checks first, then any optional/detected checks that add evidence
4. Parse PASS/FAIL per check and record which commands actually ran
5. Mark evidence fresh only when the current run produced contract-aligned success evidence or verdict artifacts
6. Update `context.md` status column when appropriate

## Step 2: Self-Audit (Always Runs)

Compare results against `context.md` requirements and `SPRINT_CONTRACT.md` even when automated verification is partial.

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
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
  selfAuditOnly: false
  allowIndeterminate: true | false
  verificationState: passed | failed | indeterminate
  evidenceFresh: true | false
  requiredChecks:
    declared: []
    executed: []
    missing: []
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
    fresh: true | false
qaReport:
  path: "{activeSliceDir}/QA_REPORT.md"
  updated: true | false
```

Passing rule:
- If `contractApplicable == true` or `verificationMode == contract`, `gateDecision: pass` requires all of the following:
  - `verificationState == passed`
  - `evidenceFresh == true`
  - `requiredChecks.missing` is empty
- Otherwise degrade to `failed` or `pass_with_warning`; never infer a full pass from self-audit alone.

## Retry Logic

When `verificationState: failed` and executable verification exists:
1. Identify failed phase
2. Add focused reproduction tests when practical
3. Update `QA_REPORT.md` with failed criteria, reproduction notes, and next-round input
4. Return to implementation with failure details
5. Re-run verification
6. Retry max 2 times

## Skip Conditions

- No test framework configured -> self-audit only
- No Acceptance Tests in `context.md` -> self-audit only
- Missing verification contract in standard profile -> fallback detection allowed
- Contract present but out of scope -> use workspace/fallback mode instead of contract mode
- Contract applicable but required checks not executed -> not eligible for `gateDecision: pass`

## Notes

- Self-Audit supplements tests; it does not replace them.
- Requirement fulfillment involves judgment; verdict artifacts provide deterministic evidence.
- A fresh verifier artifact or equivalent current-run command evidence is required before a contract-backed success verdict.
- Each verifier run should refresh `QA_REPORT.md` when `qaReportPath` is available.
- If verification fails or the run pauses before clean completion, mark `handoffPath` for update.
- If `neverDoViolations` exist, halt immediately and report to user.
