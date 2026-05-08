# Verification Contract

Use this document to define how downstream projects declare verification expectations for the harness.

## Recommended File

` .claude/verification.contract.yaml `

## Suggested Shape

```yaml
commands:
  typecheck: "npm run typecheck"
  build: "npm run build"
  test: "npm test"
  lint: "npm run lint"
  workflowParity: "bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan"
  storybookTest: "npm run storybook:test"
  playwrightVisual: "npm run test:visual"
  axeA11y: "npm run test:a11y"
  lighthouse: "npm run test:perf"
  frontendRuntime: "npm run verify:frontend-runtime"
scope:
  executionPlanes:
    - product_project
  paths:
    - "src/**"
    - "tests/**"
  fallbackOutsideScope: true
runtime:
  url: "http://localhost:3000"
  previewUrl: ""
  e2eCommand: "npm run test:e2e"
  browserFlows:
    - name: "dashboard-smoke"
      critical: true
      entry: "/dashboard"
      viewport:
        width: 390
        height: 844
      markers:
        - "Dashboard"
      criticalInteractions:
        - "create item"
        - "delete item"
      steps:
        - action: "click"
          target:
            role: "button"
            name: "Create item"
        - action: "assertVisible"
          target:
            role: "status"
            name: "Item created"
      assertions:
        - kind: "url"
          mode: "same-origin"
        - kind: "console"
          maxErrors: 0
      artifacts:
        screenshot: true
        console: true
        network: true
      passIf:
        - "primary action succeeds"
        - "list refreshes"
frontend:
  visual:
    requiredForCriticalScenarios: true
    maxDiffRatio: 0.01
    breakpoints: [390, 768, 1440]
  accessibility:
    requiredForCriticalScenarios: true
    axe: "required_when_available"
    keyboardFlow: "required_for_dialogs_and_menus"
  performance:
    requiredForCriticalScenarios: false
    budgets:
      lcpMs: 2500
      cls: 0.1
      inpMs: 200
artifacts:
  verdict: ".claude/verification-verdict-<runId>.json"
  runtimeVerdict: ".claude/runtime-verdict-<runId>.json"
  sprintContract: ".claude/execution/<slice>/SPRINT_CONTRACT.md"
  qaReport: ".claude/execution/<slice>/QA_REPORT.md"
  handoff: ".claude/execution/<slice>/HANDOFF.md"
  scorecard: ".claude/execution/<slice>/SCORECARD.md"
  workset: ".claude/execution/<slice>/WORKSET.md"
  requirementsTraceability: ".claude/execution/REQUIREMENTS_TRACEABILITY.md"
  scenarioMatrix: ".claude/execution/SCENARIO_MATRIX.md"
  uatChecklist: ".claude/execution/UAT_CHECKLIST.md"
  teamMetrics: ".claude/team-metrics-<runId>.json"
workflowEvidence:
  selectedHarnessComponents: []
  skippedHarnessComponents: []
  selectionReason: ""
  runtimeIsolation: ""
  modelEffortProfile: "standard" # economy | standard | deep | max
  selectedModelProvider: ""
  selectedModel: ""
  selectedModelEffort: ""
  modelSelectionReason: ""
strict:
  required: false
  triggers:
    - "auth"
    - "payment"
    - "deployment"
policySets:
  knowledge:
    description: "Knowledge-repo freshness and structural checks"
    checks:
      - docsAudit
  workflow:
    description: "Workflow discipline and execution-boundary checks"
    checks:
      - workflowParity
  verification:
    description: "Executable verification commands"
    checks:
      - typecheck
      - build
      - lint
  security:
    description: "Machine-checkable security or code-policy rules"
    checks:
      - securityScan
policy:
  allowIndeterminate: true
  requiredPolicySets:
    - knowledge
    - workflow
    - verification
  requiredChecks:
    - typecheck
    - build
    - lint
    - workflowParity
  optionalChecks:
    - test
    - runtime
    - storybookTest
    - playwrightVisual
    - axeA11y
    - lighthouse
    - frontendRuntime
qa:
  evaluatorMode: "separate"
  hardFailOn:
    - "core_user_flow_broken"
    - "runtime_error"
    - "contract_mismatch"
  criteria:
    functionality:
      threshold: "pass"
      focus:
        - "critical user flow"
        - "state change persists"
    requirementsCoverage:
      threshold: "pass"
      focus:
        - "every in-scope REQ has verification evidence"
        - "no requirement is closed without traceability"
    scenarioCoverage:
      threshold: "pass"
      focus:
        - "every critical SCN has runtime or E2E evidence"
        - "browser flows are mapped to user-visible scenarios"
    uatReadiness:
      threshold: "warn"
      focus:
        - "uat_ready is explicit"
        - "uat_complete is not inferred from automation"
    productDepth:
      threshold: "warn"
      focus:
        - "feature is not stub-only"
    visualQuality:
      threshold: "warn"
      focus:
        - "layout is coherent"
        - "UI avoids generic defaults"
    codeQuality:
      threshold: "warn"
      focus:
        - "no obvious dead path"
        - "no route shadowing"
hooks:
  extraChecksCommand: ""
loop:
  mode: "score_based"
  stopOnFailure: true
  scorecardRequired: true
  scorecardProfile: "auto"
  targetCompletionScore: 100
```

## Rules
- The harness owns verdict semantics, not project-specific framework logic.
- Projects declare commands and evidence through the contract.
- Frontend checks are opt-in unless a downstream contract lists them in `policy.requiredChecks` or an active `policySet` required by that contract.
- Canonical frontend command names are `storybookTest`, `playwrightVisual`, `axeA11y`, `lighthouse`, and `frontendRuntime`.
- `runtime.previewUrl` may hold an externally hosted preview target while `runtime.url` remains the local target. Verifiers should prefer the target declared for the current run, not infer a deployment URL.
- `runtime.browserFlows[].steps` describes user actions and explicit UI assertions. `assertions` describes cross-cutting checks such as URL, console, network, storage, or cookie expectations. `artifacts` declares which evidence files the run should retain.
- The optional `frontend` block records visual, accessibility, and performance expectations. It configures checks but does not require tools by itself.
- Missing optional frontend tooling is a setup gap, not a clean pass and not a hard failure, unless the check is required by the downstream contract. Required frontend checks with missing tools should block completion with a clear setup-gap verdict.
- Contracts may group checks into local `policySets` so the repository can enforce named governance bundles before any future enterprise policy-engine mapping exists.
- Contracts may declare `scope` so required checks apply only to matching planes/paths; outside that scope, fallback to the active workspace contract or detection rules.
- Completion criteria should be phrased as checks that can fail reproducibly, not vague quality claims.
- Cross-runtime behavior should be controlled through shared contract fields rather than runtime-specific wording in user-facing docs.
- `workflowEvidence` should include selected/skipped harness components, the selection reason, runtime isolation mode, and model effort profile.
- Runtime-neutral effort profiles are `economy`, `standard`, `deep`, and `max`; provider-neutral model routing maps them to runtime-specific model and effort controls.
- For runtime-heavy or UI-heavy work, prefer a separate evaluator path over generator self-approval.
- Browser/runtime checks should exercise real interactions, not only page-load screenshots.
- `SPRINT_CONTRACT.md` should define the round-level done criteria before implementation starts.
- Medium, complex, phase, high-risk, or runtime-heavy work should include evaluator contract review before implementation starts.
- In document-trace downstream runs, treat `REQUIREMENTS_TRACEABILITY.md`, `SCENARIO_MATRIX.md`, and `UAT_CHECKLIST.md` as first-class execution artifacts.
- `QA_REPORT.md` should become the next remediation input when verification fails.
- In score-based loops, `SCORECARD.md` should be the objective completion artifact for the active slice.
- `WORKSET.md` may be used as the round-level handoff manifest between retries or fresh attempts.
- `scorecardProfile` may be set explicitly to `generic`, `saas`, `api-backend`, `frontend`, or `platform`; `auto` is the default.
- `auto` should infer the scorecard profile from task intent or phase language and may rebalance only the combined `REQ + SCN` budget from detected `REQ-*` / `SCN-*` counts.
- A contract-backed success verdict should require fresh evidence for every required check that applies to the current scope.
- A completion-ready summary should cite evidence provenance for each completion-relevant claim:
  - command or verifier name
  - artifact path
  - whether the evidence was produced in the current run
- `QA_REPORT.md` should classify review findings as `accepted`, `challenged`, `deferred`, or `needs_clarification` before a remediation loop is considered closed.
- Do not convert missing evidence into positive wording such as `should pass`, `looks good`, `likely fixed`, `seems resolved`, or `done pending verification`.
- If a review item is unclear, stop for clarification before continuing the linked remediation path.
- If verification output is intentionally ignored during clean-finish review, the artifact trail should still name it explicitly so the closeout ledger stays auditable.
- If an external blocker forces a partial audit, record that as a blocker-aware partial-mode decision; do not upgrade it to a fake pass.
- Local `policySets` are repository-owned abstractions; mapping them to OPA, Policy-as-Code, or hosted policy sets is a later integration step, not a current requirement.
- A document-trace completion claim should additionally require:
  - all in-scope `REQ-*` rows to have implementation plus verification evidence
  - all critical `SCN-*` rows to have fresh runtime or E2E evidence
  - critical `SCN-*` runtime evidence to be deeper than smoke-only when claiming clean finish
  - explicit distinction between `uat_ready` and `uat_complete`
- For dual-runtime harnesses, add an explicit parity command that exercises both Claude and Codex adapter paths instead of leaving runtime parity as a QA note only.
- If a required check triggers a verifier that runs inside another required check, add an explicit skip mechanism (for example `VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity`) so nested verification does not recurse into itself.
- If the contract is missing:
  - standard profile may continue with warning
  - strict profile should block completion claims
- Project-specific domain checks should be opt-in hooks, not baked into shared verifier scripts.
- If the harness uses score-based looping:
  - `retry` should remain the default score verdict
  - the loop should stop on failed phases by default instead of silently advancing
  - completion should require both passing verification evidence and a score verdict of `done`
- Retry evidence should record `retryStrategy`, `deltaHypothesis`, and `repeatedFailurePolicy`; after two repeats of the same failure class, require `partial_redesign` or `stop_and_handoff`.
- Team-based runs should record enough observability to compare topology decisions over time:
  - `selectedPattern`
  - `selectedTeam`
  - `selectionReason`
  - `selectedHarnessComponents`
  - `skippedHarnessComponents`
  - `runtimeIsolation`
  - `modelEffortProfile`
  - `retryCount`
  - `handoffCount`
- Closeout evidence should retain ignored verification artifacts, evidence-inclusion decisions, and any partial-mode note that explains why a clean finish stayed blocked.
