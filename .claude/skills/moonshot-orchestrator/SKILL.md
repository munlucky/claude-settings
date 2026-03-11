---
name: moonshot-orchestrator
description: PM workflow orchestrator. Analyzes user requests and automatically runs the optimal agent chain.
---

# PM Orchestrator

## Role
Run PM analysis skills in sequence, resolve execution plane and workflow profile, then build the final agent chain.

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
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
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

### 3.1 Dynamic Skill Injection

| Signal | Trigger | Action |
|--------|---------|--------|
| `projectContractReady=false` | `executionPlane == product_project` | Insert `project-contract-gate` before planning |
| `contextReady=false` | `executionPlane == product_project` | Insert `context-readiness-gate` before implementation |
| `verificationContractReady=false` | `executionPlane == product_project` | Insert `verification-contract-gate` before verification |
| `buildFailed` | `verify-changes.sh` exit `1` | Insert `build-error-resolver`, retry (max 2) |
| `testFailed` | `verify-changes.sh` exit `2` | Re-enter `implementation-runner` with test-first remediation, then rerun verification |
| `runtimeUnavailable` | `verify-runtime.sh` exit `1` | Request server/runtime readiness fix, rerun `browser-verifier` (max 1) |
| `e2eFailed` | `verify-runtime.sh` exit `2` | Apply same policy as `testFailed` |
| `securityConcern` | changed files contain `.env`/`auth`/`token`/`secret` | Add `security-reviewer` after `codex-review-code` |
| `coverageLow` | `completion-verifier: coverage < 80%` | Log warning, request additional tests |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `vercel-react-best-practices` after `codex-review-code` |
| `implementationComplete` | implementation-runner completed | Insert `code-simplifier` before `completion-verifier` |
| `docStale` | pre-flight-check detects stale doc | Insert `doc-auto-sync` at start of chain |
| `phasePlanDetected` | master plan + phase docs found | Insert `moonshot-phase-runner` before `implementation-runner` |
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
5. If strict, run `verification-evidence-gate` before any completion statement.
6. On failure, retry using exit-code strategy until retry cap is reached.

### 4. Record results
Save final `analysisContext` to `.claude/docs/moonshot-analysis.yaml`.

## Contract
- Orchestrates only; does not replace the implementation skill.
- Patch merging: shallow object merge.
- Follow `document-memory-policy.md`.
