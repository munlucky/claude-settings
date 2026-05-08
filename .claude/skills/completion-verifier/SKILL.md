---
name: completion-verifier
description: Run required checks and decide whether implementation has enough evidence to be treated as complete.
context: fork
---

# Completion Verifier Skill

This is the default Verify-stage owner before finish or handoff.

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
- `analysisContext.artifacts.scorecardPath`
- `analysisContext.artifacts.requirementsTraceabilityPath`
- `analysisContext.artifacts.scenarioMatrixPath`
- `analysisContext.artifacts.uatChecklistPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.workflowEvidencePath` (if present)
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- Test framework and commands from `TEST_GUIDE.md`, `PROJECT.md`, or verification contract
- `analysisContext.signals.allowIndeterminate` (boolean override, default: `true`)
- Latest verifier verdict artifact, especially `verdict.workflowEvidence.*` from `verify-changes.sh`
- Latest verifier verdict artifact score payload, especially `verdict.score.*` from `verify-changes.sh`
- `analysisContext.codeReviewGraph` when code analysis/review/impact evidence was required earlier in the run

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
- Interpret change class conservatively:
  - `docs_only` and most `local_policy` work may complete with audit plus syntax evidence
  - `behavior_change` work should not receive a strong completion verdict without deterministic test or verifier evidence when the environment supports it
- When a verification contract is present, do not return a passing completion verdict unless fresh evidence exists for the contract-defined required checks.
- When the verifier artifact exposes `workflowEvidence.warnings`, treat them as stage-closeout gaps rather than ignorable metadata.
- When `workflowEvidence` is present, require `selectedHarnessComponents`, `skippedHarnessComponents`, `selectionReason`, `runtimeIsolation`, and `modelEffortProfile` to be populated before a clean closeout claim.
- When code structure analysis was needed for plan/execute/review, require `code-review-graph` to appear in `selectedHarnessComponents` or `skippedHarnessComponents` with a concrete reason before a clean closeout claim.
- For medium/complex/phase work, require contract review evidence (`contractReviewedByEvaluator: yes`) unless the task is explicitly simple/local and records the skip in `skippedHarnessComponents`.
- In document-trace runs, do not return a passing completion verdict while any in-scope requirement lacks verification evidence or any critical scenario lacks fresh runtime evidence.
- In phase-plan runs, parse `## Critical Product Scenarios` from the source phase document and do not return a passing completion verdict while any `SCN-*` lacks passing evidence in `QA_REPORT.md`, linked evidence files, or verifier artifacts.
- For critical `SCN-*`, smoke-only page-load evidence is a warning and does not support clean finish; require `open -> act -> mutate -> persist -> recover` or equivalent runtime/E2E evidence.
- For frontend/UI phases, reconcile declared visual, accessibility, and performance evidence separately from generic scenario evidence.
- Required frontend evidence is determined by the sprint contract, source phase plan, scenario matrix, verification contract, or critical scenario policy; do not require visual/a11y/perf evidence when none of those sources declare it.
- When required frontend evidence is missing because screenshot, visual diff, axe, keyboard, focus, Lighthouse, performance budget, browser, or preview setup is unavailable, treat the setup gap as blocking and route to retry or handoff instead of returning a strong completion verdict.
- Keep `uat_ready` and `uat_complete` separate; browser automation and frontend evidence may support `uat_ready`, but do not imply human `uat_complete`.
- In score-based loops, do not return a passing completion verdict unless the score verdict is `done`.
- Do not use success-by-implication language without fresh evidence. Forbidden examples include: `should pass`, `looks good`, `likely fixed`, `seems resolved`, `done pending verification`.

## Codex Rule References

When the verifier runs in Codex-native flow, explicitly apply:
- `.claude/rules/workflow.md`
- `.claude/rules/quality.md`
- `.claude/rules/testing.md`
- `.claude/rules/security.md`
- `.claude/rules/communication.md`
- `.claude/rules/output-format.md`
- `.claude/docs/guidelines/product-acceptance-gate.md`

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
7. Read the latest verifier verdict artifact and capture `workflowEvidence.selectedBundles`, `workflowEvidence.stageOrder`, and `workflowEvidence.warnings` when present
8. Capture `workflowEvidence.selectedHarnessComponents`, `skippedHarnessComponents`, `selectionReason`, `runtimeIsolation`, and `modelEffortProfile` when present
9. Capture evidence provenance for every completion-relevant claim:
   - command or verifier name
   - artifact path
   - whether it was produced in the current run

## Step 1.1: Score Reconciliation

Prefer score data from the latest verifier artifact when available.

1. Read `verdictArtifact.score.*` from `verify-changes.sh`
2. If no verifier score exists, read `SCORECARD.md`
3. Treat verifier-computed score as authoritative over markdown summaries
4. Require:
   - `score.current >= score.target`
   - `score.unmetChecklistItems == 0`
   - `score.blockingDefects == 0`
   - `score.verdict == done`

## Step 1.25: Traceability Reconciliation

When traceability artifacts exist, reconcile them before any completion claim.

1. Read `REQUIREMENTS_TRACEABILITY.md` and collect in-scope `REQ-*` rows
2. Confirm each in-scope requirement has implementation status, verification path, and evidence or blocker state
3. Read `SCENARIO_MATRIX.md` and collect `SCN-*` rows for user-visible flows
4. Also read `## Critical Product Scenarios` from the source phase document when present
5. Require every critical `SCN-*` to have fresh runtime, browser, generated-artifact, or E2E evidence before clean finish
6. Classify critical scenario runtime depth as `smoke` or `open-act-mutate-persist-recover`
7. Read `UAT_CHECKLIST.md` when present and distinguish `uatReady` from `uatComplete`
8. Never infer `uatComplete` from automation alone

## Step 1.5: Workflow Evidence Reconciliation

Use verifier artifact workflow evidence as the structured source of truth for review/finish closeout.

- Prefer `verdictArtifact.workflowEvidence` from `verify-changes.sh` when available.
- For code-changing bounded-direct or phase-closeout work, expect:
  - `review-bundle` in `selectedBundles`
  - `finish-bundle` in `selectedBundles`
  - `codex-review-code` in applied evidence before clean completion
  - `doc-auto-sync` evidence before clean completion
  - `QA_REPORT.md` to say `Review completed: yes`
  - `code-review-graph` selected/skipped evidence when the work required code structure analysis or review context minimization
  - finish-closeout fields in `QA_REPORT.md` to be filled with concrete closeout content, not placeholders
  - clean-finish `HANDOFF.md` marker to replace any seeded placeholder when the phase actually closes
  - contract review evidence to be present for medium/complex/phase work
  - retry strategy evidence when the latest path was `retry_loop`
- If `workflowEvidence.warnings` is not empty:
  - strict profile -> do not return `gateDecision: pass`
  - standard profile -> degrade to remediation or `pass_with_warning`, and surface the warnings in `QA_REPORT.md`
- Treat missing `stageOrder` or missing workflow evidence on code-changing closeout as a signal that finish/handoff evidence is incomplete.
- Treat missing `analysisContext.codeReviewGraph.stageCoverage` for required CRG stages as a warning. Do not build a graph in verify stage; record the gap and continue according to profile.

## Step 2: Self-Audit (Always Runs)

Compare results against `context.md` requirements and `SPRINT_CONTRACT.md` even when automated verification is partial.

```yaml
selfAuditResult:
  requirementsMet: []
  requirementsNotMet: []
  score:
    detected: true | false
    source: verifier_artifact | scorecard | none
    current: 0
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: done | retry | blocked | missing
  traceability:
    inScopeRequirements: []
    uncoveredRequirements: []
    blockedRequirements: []
    criticalScenarios: []
    scenariosMissingEvidence: []
    uatReady: true | false
    uatComplete: true | false
  runtimeEvidence:
    criticalScenarioDepth: smoke | open-act-mutate-persist-recover | none
    smokeOnlyCriticalScenarios: []
    frontendEvidence:
      visual: not_required | missing | passed | failed | blocked
      accessibility: not_required | missing | passed | failed | blocked
      performance: not_required | missing | passed | failed | blocked
      setupGaps: []
      requiredBy: []
  retryStrategy:
    retryStrategy: same_direction_refine | partial_redesign | stop_and_handoff | none
    deltaHypothesis: null
    repeatedFailurePolicy: null
  boundaryCheck:
    neverDoViolations: []
    askFirstItems: []
    alwaysDoCompleted: []
  codeReviewGraph:
    required: true | false
    selectedOrSkippedRecorded: true | false
    missingStageCoverage: []
    warnings: []
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
  score:
    detected: true | false
    source: verifier_artifact | scorecard | none
    current: 0
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: done | retry | blocked | missing
  traceability:
    requirementsMatrixDetected: true | false
    scenarioMatrixDetected: true | false
    uatChecklistDetected: true | false
    inScopeRequirements: []
    uncoveredRequirements: []
    blockedRequirements: []
    criticalScenarios: []
    scenariosMissingEvidence: []
    uatReady: true | false
    uatComplete: true | false
  runtimeEvidence:
    criticalScenarioDepth: smoke | open-act-mutate-persist-recover | none
    smokeOnlyCriticalScenarios: []
  codeReviewGraph:
    required: true | false
    graphStatus: unknown | not_built | stale | fresh | unavailable
    selectedOrSkippedRecorded: true | false
    missingStageCoverage: []
    warnings: []
  retryStrategy:
    retryStrategy: same_direction_refine | partial_redesign | stop_and_handoff | none
    deltaHypothesis: null
    repeatedFailurePolicy: null
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
    workflowEvidence:
      detected: true | false
      warnings: []
  evidenceProvenance:
    - source: "verify-changes.sh"
      artifact: ".claude/verification-verdict-<runId>.json"
      fresh: true
qaReport:
  path: "{activeSliceDir}/QA_REPORT.md"
  updated: true | false
  reviewFindingDecisions:
    - finding: "Route shadowing on reorder endpoint"
      decision: accepted | challenged | deferred | needs_clarification
      rationale: "Accepted after reproducing 422 and confirming route order bug."
```

Passing rule:
- If `contractApplicable == true` or `verificationMode == contract`, `gateDecision: pass` requires all of the following:
  - `verificationState == passed`
  - `evidenceFresh == true`
  - `requiredChecks.missing` is empty
  - `verdictArtifact.workflowEvidence.warnings` is empty for code-changing closeout work
  - `QA_REPORT.md` says `Review completed: yes` for code-changing closeout work
  - `evidenceProvenance` is populated for the completion-relevant claims
  - `score.verdict == done`
  - `score.current >= score.target`
  - `score.unmetChecklistItems == 0`
  - `score.blockingDefects == 0`
  - `traceability.uncoveredRequirements` is empty for in-scope `REQ-*`
  - `traceability.scenariosMissingEvidence` is empty for critical `SCN-*`
  - `runtimeEvidence.smokeOnlyCriticalScenarios` is empty for critical `SCN-*`
  - `traceability.uatReady == true` for user-facing finish claims
  - `codeReviewGraph.selectedOrSkippedRecorded == true` when code structure analysis was required
- Otherwise degrade to `failed` or `pass_with_warning`; never infer a full pass from self-audit alone.

## Retry Logic

When `verificationState: failed` and executable verification exists:
1. Identify failed phase
2. Add focused reproduction tests when practical
3. Update `QA_REPORT.md` with failed criteria, reproduction notes, and next-round input
4. Record `retryStrategy`, `deltaHypothesis`, and `repeatedFailurePolicy`; if the same failure class repeats twice, choose `partial_redesign` or `stop_and_handoff`
5. Return to implementation with failure details
6. Re-run verification
7. Retry max 2 times

## Skip Conditions

- No test framework configured -> self-audit only
- No Acceptance Tests in `context.md` -> self-audit only
- Missing verification contract in standard profile -> fallback detection allowed
- Contract present but out of scope -> use workspace/fallback mode instead of contract mode
- Contract applicable but required checks not executed -> not eligible for `gateDecision: pass`
- Missing score artifact in score-based runs -> not eligible for `gateDecision: pass`
- Missing traceability artifacts in standard profile -> continue, but do not claim document-complete coverage
- Missing traceability artifacts in strict document-trace runs -> not eligible for `gateDecision: pass`

## Notes

- Self-Audit supplements tests; it does not replace them.
- Requirement fulfillment involves judgment; verdict artifacts provide deterministic evidence.
- A fresh verifier artifact or equivalent current-run command evidence is required before a contract-backed success verdict.
- When available, `verdictArtifact.workflowEvidence` is the canonical structured hint for whether review/finish-stage evidence is complete enough to close the run.
- For phase closeout work, a passing verifier artifact is still insufficient if `QA_REPORT.md` shows review incomplete or finish/handoff closeout remains placeholder-quality.
- If review findings are used as remediation input, `QA_REPORT.md` must track each meaningful item as `accepted`, `challenged`, `deferred`, or `needs_clarification` before the loop can be treated as closed.
- `uatReady` and `uatComplete` are different states. Automation may establish only `uatReady`.
- Each verifier run should refresh `QA_REPORT.md` when `qaReportPath` is available.
- If verification fails or the run pauses before clean completion, mark `handoffPath` for update.
- If `neverDoViolations` exist, halt immediately and report to user.
