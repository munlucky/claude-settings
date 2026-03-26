---
name: moonshot-decide-sequence
description: Determines phase and execution chain based on analysisContext (task type, complexity, signals). Use after uncertainty detection.
---

# PM Sequence Decision

## Visibility

This is an internal analysis and routing micro-skill.
Public entry should remain at `product-orchestrator`, `moonshot-phase-runner`, or `moonshot-orchestrator`.

## Shared schema (analysisContext.v1.1)

```yaml
signals:
  executionPlane: read_only|product_project|meta_harness
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  productDefinitionRequest: false
  hasProductIntent: false
  hasPrd: false
  hasSolution: false
  hasSpec: false
  hasExecutionPlan: false
  productPackageReady: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
  workflowProfile: standard
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  sprintContractReady: false
  qaReportReady: false
  handoffRequired: false
  phaseAttemptMode: false
  designApproved: false
  isolatedWorkspaceReady: false
  evidenceGateRequired: true
decisions:
  recommendedAgents: []
  bundleChain: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: {tasksRoot}/{feature-name}/context.md
  productDir: {tasksRoot}/{feature-name}/product
  productIntentPath: {productDir}/PRODUCT_INTENT.md
  prdPath: {productDir}/PRD.md
  solutionPath: {productDir}/SOLUTION.md
  specPath: {productDir}/SPEC.md
  planPath: {productDir}/PLAN.md
  assumptionsPath: {productDir}/ASSUMPTIONS.md
  blockersPath: {productDir}/BLOCKERS.md
  taskSliceGlob: {productDir}/tasks/*.md
  executionRoot: {tasksRoot}/{feature-name}/execution
  activeSliceDir: {executionRoot}/{active-slice}
  activePhaseDocPath: null
  sprintContractPath: {activeSliceDir}/SPRINT_CONTRACT.md
  qaReportPath: {activeSliceDir}/QA_REPORT.md
  handoffPath: {activeSliceDir}/HANDOFF.md
  verificationContractPath: .claude/verification.contract.yaml
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
notes: []
```

## Phase rules
1. productDefinitionRequest == true && productPackageReady == false -> planning (upstream redirect)
2. hasPendingQuestions == true -> planning
3. implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation)) -> integration
4. implementationComplete == true -> verification
5. productPackageReady == true && hasExecutionPlan == true -> implementation
6. requirementsClear && hasContextMd && implementationReady -> implementation
7. otherwise -> planning

## Bundle selection

Build the chain from bundles first, then expand into `skillChain`.

Analysis micro-skills are orchestrator-internal and should not be presented as standalone workflow entrypoints.

- If `signals.productDefinitionRequest == true` and `signals.productPackageReady == false`:
  - route to `product-orchestrator`
  - do not continue into build planning or implementation
- If `signals.productPackageReady == true`:
  - treat `PLAN.md` and `tasks/*.md` as the planning baseline
  - skip `requirements-analyzer` and `context-builder`
  - validate the handoff package, then proceed to implementation
  - for medium/complex work, require execution bridge artifacts for the active slice
### `read_only`
- default: no implementation bundles
- if review requested: `review-bundle`

### `product_project`
- If `productDefinitionRequest == true` and `productPackageReady == false`:
  - no implementation bundles
  - route directly to `product-orchestrator`
- If `productPackageReady == true`:
  - simple:
    - `readiness-bundle`
    - `implementation-lite-bundle`
    - `verification-lite-bundle`
  - medium:
    - `readiness-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `doc-ops-bundle`
  - complex:
    - `readiness-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `doc-ops-bundle`
- If no product package is present and the request is implementation-oriented:
  - simple:
    - `readiness-bundle`
    - `planning-bundle`
    - `implementation-lite-bundle`
    - `verification-lite-bundle`
  - medium:
    - `readiness-bundle`
    - `planning-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `doc-ops-bundle`
  - complex:
    - `readiness-bundle`
    - `planning-bundle`
    - `implementation-bundle`
    - `verification-bundle`
    - `review-bundle`
    - `doc-ops-bundle`

### `meta_harness`
- simple:
  - `implementation-lite-bundle`
  - `verification-bundle`
- medium/complex:
  - `meta-harness-bundle`
  - `review-bundle`
  - `doc-ops-bundle`

## Bundle expansion

```yaml
implementation-lite-bundle:
  - implementation-runner

readiness-bundle:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate

planning-bundle:
  - requirements-analyzer
  - context-builder
  - codex-validate-plan

implementation-bundle:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier

verification-lite-bundle:
  - verify-changes.sh

verification-bundle:
  - verification-agent
  - completion-verifier

review-bundle:
  - codex-review-code
  - security-reviewer

doc-ops-bundle:
  - doc-auto-sync
  - session-logger
  - documentation-agent

logging-bundle:
  - session-logger

meta-harness-bundle:
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - completion-verifier
```

Execution-bridge expectation for medium/complex `product_project` runs:
- `implementation-runner` must create or refresh `artifacts.sprintContractPath` before code edits
- verification steps must update `artifacts.qaReportPath`
- retries, pauses, or context-boundary exits must update `artifacts.handoffPath`

## Overlay rules

- `workflowProfile == standard`
  - use the base bundle chain
- `workflowProfile == strict`
  - set `allowIndeterminate=false`
  - insert `design-approval-gate` before implementation for downstream `feature|modification`
  - insert `workspace-isolation-gate` immediately before the first `implementation-runner`
  - insert `verification-evidence-gate` after `completion-verifier` (or after `verify-changes.sh` in simple flow)

## Plane-specific rules

- `project-contract-gate`, `context-readiness-gate`, and `verification-contract-gate` apply only to `product_project`.
- `meta_harness` must skip downstream bootstrap gates.
- `read_only` must not run implementation or verification bundles.

## Additional rules

- If `signals.reactProject == true`, insert `frontend-design` immediately before the first `implementation-runner`.
- If non-trivial code was changed, insert `code-simplifier` after `implementation-runner` and before final verification.
- If `signals.reactProject == true`, layer `browser-verifier` into the verification path before `verify-changes.sh` or after `completion-verifier`.
- `qa-flow` is a manual or explicit follow-up verifier, not part of the default verification chain.
- If master-plan/phase docs are detected, insert `moonshot-phase-runner` before `implementation-runner`, unless `signals.phaseAttemptMode == true`.
- If `signals.phaseAttemptMode == true`, treat `artifacts.activePhaseDocPath` and existing execution artifacts as the only planning baseline for this round.
- For refactor tasks, insert `build-error-resolver` after failed verification and keep phased build checks.
- For medium/complex tasks, run `karpathy-execution-gate` immediately before the first `implementation-runner`.
- For medium/complex `product_project` work, ensure `doc-ops-bundle` is present so `HANDOFF.md` and session artifacts can be emitted when needed.
- If the gate reports blockers, return to planning before code edits.

## Parallel execution guide

Only run dependency-free steps in parallel.

- After classification: `moonshot-evaluate-complexity` + `moonshot-detect-uncertainty`
- After implementation: `verification-agent` + `codex-review-code`
- Documentation: `doc-auto-sync` + `session-logger` when file ownership does not overlap

Do not parallelize:
- `codex-validate-plan` and `implementation-runner`
- any strict gate and the step it guards
- `verification-evidence-gate` and completion claims

## Output (patch)

```yaml
phase: planning
decisions:
  bundleChain: []
  skillChain:
    - product-orchestrator
  recommendedAgents:
    - product-orchestrator
  parallelGroups:
    - - moonshot-evaluate-complexity
      - moonshot-detect-uncertainty
notes:
  - "phase=planning, plane=product_project, chain=product-upstream"
```

Alternate implementation-ready example:

```yaml
phase: planning
decisions:
  bundleChain:
    - readiness-bundle
    - planning-bundle
  skillChain:
    - pre-flight-check
    - project-contract-gate
    - context-readiness-gate
    - verification-contract-gate
    - requirements-analyzer
    - context-builder
    - codex-validate-plan
notes:
  - "phase=planning, plane=product_project, chain=medium"
```
