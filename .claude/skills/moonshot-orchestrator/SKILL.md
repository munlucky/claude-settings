---
name: moonshot-orchestrator
description: PM workflow orchestrator. Analyzes user requests and automatically runs the optimal agent chain.
---

# PM Orchestrator

## Role
Run PM analysis skills in sequence, resolve execution plane and workflow profile, then build the final agent chain.

This orchestrator is the **build control plane**.

Use it directly when:
- the request is already implementation-oriented
- a product package already exists under `{tasksRoot}/{feature-name}/product/`

Do not treat it as the primary entry point for raw idea shaping.
If the request is still in product-definition mode and no product package exists, redirect upstream to `product-orchestrator`.

## Usage

```bash
/moonshot-orchestrator <user-request>
/moonshot-orchestrator <user-request> --use-teams
/moonshot-orchestrator <user-request> --use-teams=review-team
```

> Available teams: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. Details in `moonshot-teams-runner/SKILL.md`.

## Entry Policy

- Use this skill by default for code work.
- Allow bypass when:
  - the user explicitly invokes a specific skill
  - the task is read-only / answer-only
  - the task is self-host work on the orchestrator or meta-workflow
- If bypassed, still prefer a lightweight `pre-flight-check` when the direct skill may edit files.

## Inputs
Automatically collected:
- `userMessage`, `gitBranch`, `gitStatus`, `recentCommits`, `openFiles`

## Runtime Adapter Policy

Resolve `executionRuntime` before orchestration:

- `claude-code`: use Claude tool routing (`Skill`, `Task`, `Plugin`, `Bash`, `AskUserQuestion`).
- `codex`: execute the same chain in the current Codex session with native tools.
  - Steps documented as `Task (fork)` must preserve isolation by passing minimal input and merging summarized output only.
  - Uncertainty/question handling must use `codex-validate-plan` (planning) and `codex-review-code` (post-implementation) outputs first.
  - Ask user only when those outputs still indicate unresolved blocking items.
- Cross-runtime policy source of truth:
  - Keep workflow policy in skills/orchestrator state.
  - `commands`/hooks are optional adapters and must only route to skills.

## Context Budget Rule

> **CRITICAL**: Protect main session context from pollution.

1. **No file content inlining**: Record paths only in `analysisContext`, never paste file contents.
2. **Sub-skill results**: Merge only summarized output into notes (max 5 lines per result).
3. **Notes cap**: When notes array exceeds 10 items, archive oldest items.
4. **Review results**: Extract key issues only from `codex-review-code` output.
5. **Fork returns**: Accept only structured summaries from fork agents, never raw data.

## Workflow

### 1. Initialize analysisContext

```yaml
schemaVersion: "1.1"
request: { userMessage, taskType: unknown, keywords: [] }
repo: { gitBranch, gitStatus, openFiles: [], changedFiles: [] }
signals:
  executionPlane: unknown
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
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
  sprintContractReady: false
  qaReportReady: false
  handoffRequired: false
  workflowProfile: standard
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  designApproved: false
  isolatedWorkspaceReady: false
  evidenceGateRequired: true
  allowIndeterminate: true
  harnessVerdictRequired: true
estimates: { estimatedFiles: 0, estimatedLines: 0, estimatedTime: unknown }
phase: unknown
complexity: unknown
missingInfo: []
decisions: { recommendedAgents: [], bundleChain: [], skillChain: [], parallelGroups: [] }
fixForward:
  enabled: true
  policy: { critical: block, high: fix-forward-task, medium: merge-with-note, low: auto-approve }
  tasks: []
artifacts:
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"
  contextDocPath: "{tasksRoot}/{feature-name}/context.md"
  productDir: "{tasksRoot}/{feature-name}/product"
  productIntentPath: "{productDir}/PRODUCT_INTENT.md"
  prdPath: "{productDir}/PRD.md"
  solutionPath: "{productDir}/SOLUTION.md"
  specPath: "{productDir}/SPEC.md"
  planPath: "{productDir}/PLAN.md"
  assumptionsPath: "{productDir}/ASSUMPTIONS.md"
  blockersPath: "{productDir}/BLOCKERS.md"
  taskSliceGlob: "{productDir}/tasks/*.md"
  executionRoot: "{tasksRoot}/{feature-name}/execution"
  activeSliceDir: "{executionRoot}/{active-slice}"
  sprintContractPath: "{activeSliceDir}/SPRINT_CONTRACT.md"
  qaReportPath: "{activeSliceDir}/QA_REPORT.md"
  handoffPath: "{activeSliceDir}/HANDOFF.md"
  verificationContractPath: ".claude/verification.contract.yaml"
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
  verificationResultPath: "{tasksRoot}/{feature-name}/verification-result.json"
tokenBudget: { specSummaryTrigger: 2000, splitTrigger: 5, contextMaxTokens: 8000, warningThreshold: 0.8 }
projectMemory: { projectId: null, boundaryStatus: "not_checked", boundary: { violations: [], needsApproval: [], reminders: [] }, relatedConventions: [], lastChecked: null }
notes: []
```

### 2. Run PM skills sequentially

#### 2.0 Large specification handling
Follow `.claude/docs/guidelines/document-memory-policy.md`:
- `userMessage` > 2000 words -> summarize to `specification.md`, archive original
- Independent features > 5 -> split into `subtasks/subtask-NN/` with independent `context.md`
- Keep `context.md` under `tokenBudget.contextMaxTokens`

#### 2.0.1 Resolve execution plane

Set `signals.executionPlane` before task classification:

- `read_only`
  - summarization, explanation, lookups, review-only requests
- `product_project`
  - downstream application/service implementation work
- `meta_harness`
  - changes to `.claude/skills`, `.claude/rules`, `.claude/agents`, installer/distribution logic, or harness scripts

#### 2.0.2 Harness gate defaults
- Default `signals.allowIndeterminate` to `true`.
- When test environment is missing (`indeterminate`), continue by recording `pass_with_warning` by default.
- In strict mode (`allowIndeterminate=false`), treat indeterminate as blocking.

#### 2.0.3 Workflow profile resolution (standard vs strict)
- Default `signals.workflowProfile` to `standard`.
- Promote to `strict` if one of the following is true:
  - User explicitly asks for strict/no-warning/hard-gate behavior.
  - Project policy for the current task requires strict verification discipline.
  - `executionPlane == meta_harness` and the task edits core workflow files.
- When `workflowProfile == strict`:
  - Set `signals.allowIndeterminate = false`.
  - Require design approval gate before implementation (`design-approval-gate`) for downstream product changes.
  - Require isolated workspace gate before first implementation (`workspace-isolation-gate`).
  - Require evidence gate before any completion claim (`verification-evidence-gate`).

#### 2.0.4 Load Project Memory (Fork)

> Run `project-memory-agent` as **fork subagent** to prevent context pollution.

```
Task tool: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
Returns: { projectId, loaded, boundaries, relevantRules } -> merge into projectMemory
```

#### 2.0.6 Product package detection
Before normal build planning, detect whether upstream product-definition artifacts already exist.

Detection targets:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`

Merge signals:
- `hasProductIntent`
- `hasPrd`
- `hasSolution`
- `hasSpec`
- `hasExecutionPlan`
- `productPackageReady`
- `implementationReady`

Routing rule:
- If `productDefinitionRequest == true` and `productPackageReady == false`, hand off to `product-orchestrator`
- If `productPackageReady == true`, skip upstream planning stages and use the handoff package as the implementation baseline

#### 2.0.7 Execution bridge defaults

For `product_project` work, treat execution artifacts as first-class state:
- `SPRINT_CONTRACT.md` defines the current slice goal, non-goals, done checks, and evaluator focus
- `QA_REPORT.md` records verifier findings and feeds the next remediation round
- `HANDOFF.md` captures resumable state when the run is interrupted, retried, or context pressure is high

Policy:
- medium/complex product work must not enter code changes without a slice-level sprint contract
- verification steps must update `QA_REPORT.md` whenever they run
- failed verification, retry loops, or interrupted runs should mark `signals.handoffRequired = true`

#### 2.1 Task classification
Run `/moonshot-classify-task` -> merge patch (`taskType`, `keywords`, `signals`)

#### 2.2 Complexity evaluation
Run `/moonshot-evaluate-complexity` -> merge patch (`complexity`, `estimates`)

#### 2.3 Readiness scan
Run `pre-flight-check` when the task may edit files.
- The scan should set:
  - `signals.projectContractReady`
  - `signals.contextReady`
  - `signals.verificationContractReady`
  - `signals.executionPlane` when the initial heuristic was weak
  - `signals.shouldEscalateStrict`

#### 2.4 Uncertainty detection
Run `/moonshot-detect-uncertainty` -> merge patch (`missingInfo`)

#### 2.5 Uncertainty handling
If `missingInfo` is not empty:
1. Resolve blocking questions.
2. Merge answers into `analysisContext`.
3. Re-run detection if needed.

#### 2.6 Sequence decision
Run `/moonshot-decide-sequence` -> merge patch (`phase`, `bundleChain`, `skillChain`, `parallelGroups`)

### 3. Execute the agent chain

Run `decisions.skillChain` in order.

**Allowed steps:**

| Step | Type | Notes |
|------|------|-------|
| `pre-flight-check` | Skill | emits readiness signals |
| `teach-impeccable` | Skill | design-context bootstrap for UI work |
| `frontend-design` | Skill | visual direction and anti-pattern guard for UI implementation |
| `audit` | Skill | review-only UI quality audit |
| `normalize` | Skill | align UI work to existing design system |
| `polish` | Skill | final UI finishing pass |
| `product-orchestrator` | Skill | upstream redirect only |
| `project-contract-gate` | Skill | downstream bootstrap gate |
| `context-readiness-gate` | Skill | downstream task-context gate |
| `verification-contract-gate` | Skill | downstream verification gate |
| `project-memory-agent` | Task (fork) | context isolation |
| `project-memory-check` | Task (fork) | pre-implementation boundary check |
| `requirements-analyzer` | Task | |
| `context-builder` | Task | |
| `codex-validate-plan` | Skill | |
| `design-approval-gate` | Skill | strict profile design approval gate |
| `workspace-isolation-gate` | Skill | strict profile branch/workspace isolation gate |
| `karpathy-execution-gate` | Skill | pre-implementation discipline gate |
| `implementation-runner` | Task | |
| `code-simplifier` | Plugin | post-implementation simplification |
| `completion-verifier` | Skill (fork) | contract-aware verification |
| `verification-evidence-gate` | Skill | strict profile evidence-before-completion gate |
| `doc-auto-sync` | Skill | auto-docs update & bootstrap |
| `codex-review-code` | Skill | |
| `project-memory-reviewer` | Task (fork) | context isolation |
| `vercel-react-best-practices` | Skill | when reactProject=true |
| `security-reviewer` | Skill | |
| `build-error-resolver` | Skill | |
| `browser-verifier` | Skill | runtime check for web projects |
| `verify-runtime.sh` | Bash | runtime URL/E2E verifier |
| `verify-changes.sh` | Bash | verdict-emitting project verifier |
| `efficiency-tracker` | Skill | |
| `session-logger` | Skill | |
| `moonshot-phase-runner` | Skill | |
| `moonshot-teams-runner` | Skill | |
| `team-leader-agent` | Task (fork) | teams coordination |
| `failure-analyzer` | Skill (fork) | system failure analysis |
| `workflow-self-improver` | Skill (fork) | meta-system auto-improvement |
| `commit-moonshot` | Skill | |

**Agent mapping:**

| Agent | subagent_type | Notes |
|-------|---------------|-------|
| `project-memory-agent` | general-purpose | fork, before 2.1 |
| `project-memory-check` | general-purpose | fork, check-only mode before implementation (`.claude/agents/project-memory-check.md`) |
| `requirements-analyzer` | general-purpose | |
| `context-builder` | context-builder | |
| `implementation-runner` | implementation-agent | |
| `project-memory-reviewer` | general-purpose | fork, after codex-review-code |
| `team-leader-agent` | general-purpose | fork, --use-teams |

**Execution rules:**
1. Run steps sequentially (parallelize only within `parallelGroups`)
2. Runtime routing:
   - `claude-code`: Skill → `Skill` tool, Agent → `Task` tool, Plugin → `Plugin` tool, Script → `Bash` tool
   - `codex`: run equivalent logic in-session with native tools/shell while preserving step contracts
3. For `Task (fork)` semantics, keep context isolation (minimal input, summarized return only) in both runtimes
4. Undefined step → ask user and stop
5. All steps must follow `document-memory-policy.md`
6. If `product-orchestrator` is selected, treat it as a redirect/handoff boundary and do not continue the build chain in the same pass unless a product package is returned

**Execution bridge contract**:
- Before the first `implementation-runner` in medium/complex `product_project` work, materialize `artifacts.sprintContractPath`
- `implementation-runner` must treat `SPRINT_CONTRACT.md` as the round-level source of truth for code edits
- `completion-verifier`, `verify-runtime.sh`, and `verify-changes.sh` should update `artifacts.qaReportPath`
- If verification fails, retries begin, or the session cannot finish cleanly, write/update `artifacts.handoffPath`

**Memory-step separation contract**:
- `project-memory-agent`: load/update project memory context at phase 2.0.5
- `project-memory-check`: pre-implementation boundary check (check-only, no memory mutation, use `.claude/agents/project-memory-check.md`)
- `project-memory-reviewer`: post-review boundary compliance verification

**Agent Teams Integration (--use-teams):**
1. Set `signals.useAgentTeams = true`
2. Fork `team-leader-agent` with team config (see `moonshot-teams-runner/SKILL.md` for team details)
3. Merge summarized `teamReport` into `analysisContext.notes`

> [!CAUTION]
> Agent Teams: ~13K tokens (2-member) / ~20K tokens (3-member). Use for critical reviews or complex implementations only.

**Fork-based agents** (`project-memory-agent`, `project-memory-check`, `project-memory-reviewer`, `team-leader-agent`):
- Run in separate context sessions
- Return only summarized results → prevents main session context pollution
### 3.1 Dynamic Skill Injection

| Signal | Trigger | Action |
|--------|---------|--------|
| `projectContractReady=false` | `executionPlane == product_project` | Insert `project-contract-gate` before planning |
| `contextReady=false` | `executionPlane == product_project` | Insert `context-readiness-gate` before implementation |
| `verificationContractReady=false` | `executionPlane == product_project` | Insert `verification-contract-gate` before verification |
| `executionBridgeNeeded` | `executionPlane == product_project && complexity != simple` | Ensure `session-logger` is present and require `SPRINT_CONTRACT.md` before first code edit |
| `buildFailed` | `verify-changes.sh` exit `1` | Insert `build-error-resolver`, retry (max 2) |
| `testFailed` | `verify-changes.sh` exit `2` | Re-enter `implementation-runner` with test-first remediation, then rerun verification |
| `runtimeUnavailable` | `verify-runtime.sh` exit `1` | Request server/runtime readiness fix, rerun `browser-verifier` (max 1) |
| `e2eFailed` | `verify-runtime.sh` exit `2` | Apply same policy as `testFailed` |
| `browserFlowFailed` | `verify-runtime.sh` exit `3` | Re-enter runtime/browser remediation path, then rerun `browser-verifier` |
| `verificationFailed` | `completion-verifier` or runtime verifier fails | Update `QA_REPORT.md`, re-enter implementation with contract-linked findings |
| `securityConcern` | changed files contain `.env`/`auth`/`token`/`secret` | Add `security-reviewer` after `codex-review-code` |
| `coverageLow` | `completion-verifier: coverage < 80%` | Log warning, request additional tests |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `frontend-design` before `implementation-runner` |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `vercel-react-best-practices` after `codex-review-code` |
| `implementationComplete` | implementation-runner completed | Insert `code-simplifier` before `completion-verifier` |
| `docStale` | pre-flight-check detects stale doc | Insert `doc-auto-sync` at start of chain |
| `phasePlanDetected` | master plan + phase docs found | Insert `moonshot-phase-runner` before `implementation-runner` |
| `handoffRequired` | retry loop, interruption, or context budget warning | Update `HANDOFF.md` through `session-logger` before pausing |
| `strictProfile` | `workflowProfile == strict` and no evidence step | Insert `verification-evidence-gate` after `completion-verifier` or `verify-changes.sh` |
| `multipleFailures` | notes contain > 2 errors/failures | Append `failure-analyzer` + `workflow-self-improver` at end of chain |

### 3.2 Execution-plane rules

- `read_only`
  - do not inject readiness gates
  - do not run implementation or completion verification
- `product_project`
  - use readiness gates and downstream bootstrap skills
- `meta_harness`
  - skip downstream bootstrap gates
  - prefer strict profile for changes to core workflow contracts

### 3.3 Completion Verification Loop

After `implementation-runner`:
1. If `completion-verifier` exists in `decisions.skillChain`, call it.
2. If `completion-verifier` is absent (simple flow), use `verify-changes.sh` (and `browser-verifier` for web projects) as completion gate.
3. If `completionStatus.verificationState == passed`, proceed.
4. If `completionStatus.verificationState == indeterminate`:
   - strict -> treat as failure
   - standard -> record `pass_with_warning`
5. Update `artifacts.qaReportPath` with verdict, failed criteria, and next-round input.
6. If strict, run `verification-evidence-gate` before any completion statement.
7. On failure, retry using exit-code strategy until retry cap is reached.
8. If the run stops before clean completion, write `artifacts.handoffPath`.

### 4. Record results
Save final `analysisContext` to `.claude/docs/moonshot-analysis.yaml`.

## Contract
- Orchestrates only, does not analyze directly
- Patch merging: shallow object merge
- User questions: `AskUserQuestion` on Claude runtime; on Codex runtime, prioritize `codex-validate-plan`/`codex-review-code` outputs and ask user only for unresolved blockers
- Build-only boundary: if upstream product-definition work is still missing, route to `product-orchestrator` instead of inventing product artifacts inside the build chain
- Product-package handoff: when `PLAN.md` + `tasks/*.md` exist, treat them as the planning source of truth and skip `requirements-analyzer` / `context-builder`
- Execution bridge: medium/complex `product_project` work must keep `SPRINT_CONTRACT -> QA_REPORT -> HANDOFF` artifacts synchronized with the active slice
- Follow `document-memory-policy.md`
