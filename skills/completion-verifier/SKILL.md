---
name: completion-verifier
description: Run required checks and decide whether implementation has enough evidence to be treated as complete.
context: fork
---

# Completion Verifier Skill

Completion verifier is the Verify-stage assembler. It gathers fresh evidence, runs or requests the required checks, writes structured verification evidence when available, and returns a stable output shape. It does not own completion authority policy.

## Owner Map

Use these owners instead of duplicating their rules in this prompt:

| Area | Owner |
|------|-------|
| Runtime completion authority | `scripts/runtime-state.mjs` and `scripts/lib/runtime-state-store.mjs` |
| Verification planes and summary projections | `scripts/verification-plane.mjs` and `scripts/lib/verification-plane.mjs` |
| Active verification contract | `schemas/verification.contract.yaml` |
| Verification profile guidance | `docs/public/guidelines/verification-contract.md` |
| Workflow evidence closeout | `docs/public/guidelines/verification-workflow-evidence.md` |
| Product acceptance policy | `docs/public/guidelines/product-acceptance-gate.md` |
| Agent operating policy evidence | `docs/public/guidelines/agent-operating-policy.md`, `schemas/agent-operation.contract.yaml` |

## Inputs

- `analysisContext.*`
- `context.md`
- `analysisContext.artifacts.sprintContractPath`
- `analysisContext.artifacts.qaReportPath`
- `analysisContext.artifacts.handoffPath`
- `analysisContext.artifacts.scorecardPath`
- `analysisContext.artifacts.requirementsTraceabilityPath`
- `analysisContext.artifacts.scenarioMatrixPath`
- `analysisContext.artifacts.uatChecklistPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.workflowEvidencePath`
- Fresh verifier verdict artifacts and current-run command outputs

## Non-Negotiables

- Do not treat chat output, `phase-status.yaml`, verifier JSON, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, `taskLocalCompletion`, `wholePlanAuthority`, or `compactStatus.latestVerificationEvidence` as accepted completion authority.
- Accepted clean finish requires runtime-state DB authority from `scripts/runtime-state.mjs assess-completion` when that authority is available.
- `taskLocalCompletion` is profile-scoped evidence completeness only.
- `wholePlanAuthority` is evidence eligibility only; accepted completion still requires a runtime-state DB decision.
- `profileRequiredPlanes` and `--required-planes-json` are summary scope controls only and must not weaken `completionAuthorityRequiredPlanes`.
- Preserve output keys: `completionStatus`, `gateDecision`, `workflowEvidence`, `evidenceProvenance`, and `qaReport`.
- If workflow evidence warnings, missing required checks, stale evidence, missing identity, worsened evals, unresolved blockers, missing score, missing traceability, or required frontend/setup gaps exist, do not return `gateDecision: pass`.

## Flow

1. Resolve the active verification contract from `schemas/verification.contract.yaml` or the provided contract artifact.
2. Determine the applicable profile and required checks from the contract, `TEST_GUIDE.md`, project docs, or fallback detection.
3. Run executable checks that are in scope and record command/provenance for every completion-relevant claim.
4. When verification plane evidence is available, record it through `scripts/verification-plane.mjs record-summary --json`.
5. Read score, traceability, scenario, UAT, workflow evidence, agent operating policy evidence, and QA report state using `docs/public/guidelines/verification-workflow-evidence.md`.
6. Run or request `scripts/runtime-state.mjs assess-completion --json` for whole-plan completion authority when available.
7. Return the output shape below. Degrade to `failed` or `pass_with_warning` instead of inferring a clean pass.

## Output Shape

```yaml
completionStatus:
  testEnvironment: true | false
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
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
    uncoveredRequirements: []
    scenariosMissingEvidence: []
    uatReady: true | false
    uatComplete: true | false
  taskLocalCompletion:
    status: complete | blocked | missing
  wholePlanAuthority:
    status: evidence_eligible | blocked | missing
    acceptedCompletionRequired: true
  gateDecision: pass | failed | pass_with_warning
workflowEvidence:
  detected: true | false
  selectedHarnessComponents: []
  skippedHarnessComponents: []
  warnings: []
evidenceProvenance:
  - source: ""
    artifact: ""
    fresh: true | false
qaReport:
  path: ""
  updated: true | false
  reviewFindingDecisions: []
```

## Passing Rule

`gateDecision: pass` is allowed only when all applicable checks are fresh, required checks are complete, workflow evidence has no blocking warnings, score verdict is `done`, linked acceptance criteria are passing or explicitly `not_applicable`, critical scenarios have fresh evidence, UAT is ready for user-facing finish claims, and accepted runtime-state completion authority is present when required.

## Failure And Handoff

When the gate cannot pass:

- Record the concrete blocker or missing evidence.
- Update `QA_REPORT.md` if a path is available.
- Keep `uat_ready` separate from `uat_complete`.
- Return retry or handoff guidance without success-by-implication language.
- If a review reject or eval regression should block resumed closeout, record it with the runtime-state owner.
