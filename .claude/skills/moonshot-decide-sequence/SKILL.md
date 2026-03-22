---
name: moonshot-decide-sequence
description: Determines phase and execution chain based on analysisContext (task type, complexity, signals). Use after uncertainty detection.
---

# PM Sequence Decision

## Shared schema (analysisContext.v1)
```yaml
schemaVersion: "1.0"
request:
  userMessage: "..."
  taskType: feature|modification|bugfix|refactor|unknown
  keywords: []
repo:
  gitBranch: "..."
  gitStatus: clean|dirty
  openFiles: []
  changedFiles: []
signals:
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
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: planning|implementation|integration|verification|unknown
complexity: simple|medium|complex|unknown
missingInfo: []
fixForward:
  enabled: true
  policy:
    critical: block           # security/data integrity issue -> block merge
    high: fix-forward-task    # auto-create follow-up task after merge
    medium: merge-with-note   # allow merge with warning note
    low: auto-approve         # auto-approve
  tasks: []                   # follow-up tasks created by codex-review-code
decisions:
  recommendedAgents: []
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

## Chain rules
Include only stages to run **after moonshot-decide-sequence** (do not include moonshot-* skills).

- If `signals.productDefinitionRequest == true` and `signals.productPackageReady == false`:
  - route to `product-orchestrator`
  - do not continue into build planning or implementation
- If `signals.productPackageReady == true`:
  - treat `PLAN.md` and `tasks/*.md` as the planning baseline
  - skip `requirements-analyzer` and `context-builder`
  - validate the handoff package, then proceed to implementation

- simple: implementation-runner -> verify-changes.sh
- medium: requirements-analyzer -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker
- complex: pre-flight-check -> requirements-analyzer -> context-builder -> codex-validate-plan -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker -> session-logger

**Product-package-aware overrides**:
- simple + productPackageReady: implementation-runner -> verify-changes.sh
- medium + productPackageReady: codex-validate-plan -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker
- complex + productPackageReady: pre-flight-check -> codex-validate-plan -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker -> session-logger
- any complexity + productDefinitionRequest && !productPackageReady: product-orchestrator

**Execution discipline gate (Karpathy loop)**:
- For medium/complex tasks, run `karpathy-execution-gate` immediately before the first `implementation-runner`.
- Gate focus: think before coding, simplicity first, surgical changes, goal-driven execution.
- If the gate reports blockers, return to planning before code edits.

**Web runtime verification**:
- If `signals.reactProject == true`, insert `browser-verifier` before `verify-changes.sh`.
- `browser-verifier` runs `.claude/agents/verification/verify-runtime.sh` for URL/E2E checks.

**Project memory check semantics**:
- Keep `project-memory-check` as a distinct stage from `project-memory-agent`.
- `project-memory-check` is check-only (boundary validation), while `project-memory-agent` handles memory load/update.

**Phase runner handoff rule**:
- If master-plan/phase docs are detected for multi-phase execution, insert `moonshot-phase-runner` before `implementation-runner`.
- Treat `moonshot-phase-runner` as preparation-only. Completion gates run after external phase execution updates `.claude/docs/phase-status.yaml`.

**Refactor-specific rules** (taskType == refactor):
- Always include `build-error-resolver` after `implementation-runner` for automatic build verification
- For complex refactors: implementation-runner executes in phased mode with build checks between phases
- Reference: `.claude/rules/scope-confirmation.md`, `.claude/rules/refactoring-guidelines.md`

**Note**: `project-memory-check` runs after planning and before implementation to verify boundary compliance.

Complex always includes test-based completion verification.

**Testing Integration** (ref: `.claude/rules/testing.md`):
- medium/complex chains include `completion-verifier` after implementation
- Request additional tests if coverage < 80%
- API changes require integration tests

**Security & Build Error Integration**:
- `security-reviewer`: Triggered when security concern detected (auth changes, env file modified, new dependencies)
- `build-error-resolver`: Triggered when `tsc`/`build` fails, inserted before next implementation step

**Verification exit code strategy**:
- `verify-changes.sh` `exit 1`: Build/typecheck/general verification failure → invoke `build-error-resolver` and retry implementation fix.
- `verify-changes.sh` `exit 2`: Test failure → re-enter `implementation-runner` with test-first remediation (add/fix tests) before rerunning verification.
- `verify-runtime.sh` `exit 1`: Runtime unavailable (server/env issue) → fix runtime readiness and rerun `browser-verifier`.
- `verify-runtime.sh` `exit 2`: E2E failure → apply the same policy as test failure (`verify-changes.sh` exit 2).
- `completion-verifier` `verificationState: indeterminate` (usually `allPassed: null`): run fallback gate (`verify-changes.sh` + optional `browser-verifier`) before final completion decision.

**Fix Forward Post-Review Branching**:
- After `codex-review-code`, check review verdict and apply `fixForward.policy`:
  - `CRITICAL` → **HALT** (do not merge, re-enter implementation)
  - `HIGH` → **MERGE + create fix-forward task** → append to `fixForward.tasks[]`
  - `MEDIUM` → **MERGE + add note** to `notes[]`
  - `LOW` / No issues → **MERGE** normally

## Parallel execution guide
Only run dependency-free steps in parallel. If results affect the next stage, do not parallelize.

**Possible parallel examples**:
- After `/moonshot-classify-task`: `/moonshot-evaluate-complexity` + `/moonshot-detect-uncertainty`
- After implementation: `codex-review-code` + `verify-changes.sh` (re-run verify if review changes)
- Web project runtime check: `codex-review-code` + `browser-verifier` (re-run runtime verify after code fixes)
- Logging: `efficiency-tracker` + `session-logger`

**Not allowed in parallel**:
- `requirements-analyzer` <-> `context-builder` (requirements must precede)
- `codex-validate-plan` <-> `implementation-runner` (plan validation before implementation)

## Output (patch)
```yaml
phase: planning
decisions.skillChain:
  - product-orchestrator
decisions.parallelGroups:
  - - moonshot-evaluate-complexity
    - moonshot-detect-uncertainty
decisions.recommendedAgents:
  - product-orchestrator
notes:
  - "phase=planning, chain=product-upstream"
```
