---
name: moonshot-orchestrator
description: PM workflow orchestrator. Analyzes user requests and automatically runs the optimal agent chain.
---

# PM Orchestrator

## Role
Runs PM analysis skills in sequence and builds the final agent chain.

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

## Context Budget Rule

> **CRITICAL**: Protect main session context from pollution.

1. **No file content inlining**: Record paths only in analysisContext, never paste file contents
2. **Sub-skill results**: Merge only summarized output into notes (max 5 lines per result)
3. **Notes cap**: When notes array exceeds 10 items, archive oldest items
4. **Review results**: Extract key issues only from codex-review-code output
5. **Fork returns**: Accept only structured summaries from fork agents, never raw data

## Workflow

### 1. Initialize analysisContext

```yaml
schemaVersion: "1.0"
request: { userMessage, taskType: unknown, keywords: [] }
repo: { gitBranch, gitStatus, openFiles: [], changedFiles: [] }
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
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
estimates: { estimatedFiles: 0, estimatedLines: 0, estimatedTime: unknown }
phase: unknown
complexity: unknown
missingInfo: []
decisions: { recommendedAgents: [], skillChain: [], parallelGroups: [] }
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
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
tokenBudget: { specSummaryTrigger: 2000, splitTrigger: 5, contextMaxTokens: 8000, warningThreshold: 0.8 }
projectMemory: { projectId: null, boundaryStatus: "not_checked", boundary: { violations: [], needsApproval: [], reminders: [] }, relatedConventions: [], lastChecked: null }
notes: []
```

### 2. Run PM skills sequentially

#### 2.0 Large specification handling
Follow `.claude/docs/guidelines/document-memory-policy.md`:
- `userMessage` > 2000 words → summarize to `specification.md`, archive original
- Independent features > 5 → split into `subtasks/subtask-NN/` with independent `context.md`
- Keep `context.md` under `tokenBudget.contextMaxTokens`

#### 2.0.5 Load Project Memory (Fork)

> Run `project-memory-agent` as **fork subagent** to prevent context pollution.

```
Task tool: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
Returns: { projectId, loaded, boundaries, relevantRules } → merge into projectMemory
```
- Codex runtime: execute equivalent isolated subtask with the same I/O contract.
- No memory: `boundaryStatus: "not_initialized"`, continue
- MCP unavailable: `boundaryStatus: "not_checked"`, warn and continue

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

#### 2.1 Task classification
Run `/moonshot-classify-task` → merge patch (taskType, keywords, signals)

#### 2.2 Complexity evaluation
Run `/moonshot-evaluate-complexity` → merge patch (complexity, estimates)

#### 2.3 Uncertainty detection
Run `/moonshot-detect-uncertainty` → merge patch (missingInfo)

#### 2.4 Uncertainty handling
If `missingInfo` not empty:
1. Resolve uncertainty questions:
   - `claude-code`: generate questions via `AskUserQuestion` (priority HIGH first)
   - `codex`: run `codex-validate-plan` first to derive blocking questions; defer user questioning until unresolved blockers remain
2. Merge answers into analysisContext
3. Set `signals.hasPendingQuestions = false`
4. Re-run detection if needed

#### 2.5 Sequence decision
Run `/moonshot-decide-sequence` → merge patch (phase, skillChain, parallelGroups)

#### 2.6 Plan size management
Follow `document-memory-policy.md`: archive at 80% threshold, summarize at 100%.

### 3. Execute the agent chain

Run `decisions.skillChain` in order.

**Allowed steps:**

| Step | Type | Notes |
|------|------|-------|
| `pre-flight-check` | Skill | |
| `product-orchestrator` | Skill | Upstream redirect only |
| `project-memory-agent` | Task (fork) | Context isolation |
| `project-memory-check` | Task (fork) | Pre-implementation boundary check |
| `requirements-analyzer` | Task | |
| `context-builder` | Task | |
| `codex-validate-plan` | Skill | |
| `karpathy-execution-gate` | Skill | Pre-implementation discipline gate |
| `implementation-runner` | Task | |
| `code-simplifier` | Plugin | Post-implementation simplification |
| `completion-verifier` | Skill (fork) | Test environment auto-detect |
| `doc-auto-sync` | Skill | Auto-docs update & bootstrap |
| `codex-review-code` | Skill | |
| `project-memory-reviewer` | Task (fork) | Context isolation |
| `vercel-react-best-practices` | Skill | When reactProject=true |
| `security-reviewer` | Skill | |
| `build-error-resolver` | Skill | |
| `browser-verifier` | Skill | Runtime check for web projects |
| `verify-runtime.sh` | Bash | Runtime URL/E2E verifier |
| `verify-changes.sh` | Bash | |
| `efficiency-tracker` | Skill | |
| `session-logger` | Skill | |
| `moonshot-phase-runner` | Skill | |
| `moonshot-teams-runner` | Skill | |
| `team-leader-agent` | Task (fork) | Teams coordination |
| `failure-analyzer` | Skill (fork) | System failure analysis |
| `workflow-self-improver` | Skill (fork) | Meta-system auto-improvement |
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
| `buildFailed` | `verify-changes.sh` exit `1` | Insert `build-error-resolver`, retry (max 2) |
| `testFailed` | `verify-changes.sh` exit `2` | Re-enter `implementation-runner` with test-first remediation, then rerun verification |
| `runtimeUnavailable` | `verify-runtime.sh` exit `1` | Request server/runtime readiness fix, rerun `browser-verifier` (max 1) |
| `e2eFailed` | `verify-runtime.sh` exit `2` | Apply same policy as `testFailed` (test-first remediation + rerun runtime verification) |
| `securityConcern` | Changed files contain `.env`/`auth`/`token`/`secret` | Add `security-reviewer` after codex-review-code |
| `coverageLow` | completion-verifier: coverage < 80% | Log warning, request additional tests |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `vercel-react-best-practices` after codex-review-code |
| `implementationComplete` | implementation-runner completed | Insert `code-simplifier` before completion-verifier |
| `docStale` | pre-flight-check detects stale doc | Insert `doc-auto-sync` at start of chain |
| `newProject` | missing ARCHITECTURE.md + complex task | Insert `doc-auto-sync --init` at start of chain |
| `webRuntimeCheck` | `reactProject == true` | Insert `browser-verifier` before `verify-changes.sh` (or right after `completion-verifier` if `verify-changes.sh` is absent) |
| `phasePlanDetected` | master plan + phase docs found | Insert `moonshot-phase-runner` before `implementation-runner` for phase-status preparation/handoff |
| `executionDisciplineMissing` | medium/complex chain has `implementation-runner` but no `karpathy-execution-gate` | Insert `karpathy-execution-gate` right before the first `implementation-runner` |
| `multipleFailures` | notes contain > 2 errors/failures | Append `failure-analyzer` + `workflow-self-improver` at end of chain |

### 3.2 Project Memory Review (Fork)

After `codex-review-code`:
```
Task tool: project-memory-reviewer (subagent_type: general-purpose)
Input: { projectId, changedFiles, projectMemoryContext, diff }
Returns: { status, violations, needsApproval, warnings, reminders }
```
- `status: "failed"` → **HALT**, report violations
- `status: "needs_approval"` → ask user
- `status: "passed"` → proceed

### 3.3 Completion Verification Loop

After `implementation-runner`:
1. If `completion-verifier` exists in `decisions.skillChain`, call it.
2. If `completion-verifier` is absent (simple flow), use `verify-changes.sh` (and `browser-verifier` for web projects) as completion gate.
3. If `completionStatus.verificationState == passed` (or equivalent gate pass) → mark `implementationComplete: true`, proceed.
4. If `completionStatus.verificationState == indeterminate` (typically `allPassed: null`):
   - Run fallback gate: `verify-changes.sh` (and `browser-verifier` for web projects) when available.
   - If fallback gate passes and Self-Audit has no blockers → proceed with `implementationComplete: true` and add warning note.
   - If fallback gate is unavailable or fails → ask user for explicit decision/intervention.
5. Failure (`verificationState == failed` or fallback gate fail) + retryCount < 2 → return to failed phase and apply exit-code strategy (`exit 1` build-first fix, `exit 2` test-first fix), then retry.
6. Failure + retryCount ≥ 2 → ask user for intervention.

### 3.4 Phase Runner Handoff Contract

When `moonshot-phase-runner` is used in chain:
1. Treat it as **execution preparation**, not implementation completion.
2. Require `.claude/docs/phase-status.yaml` output and merge summary fields into `notes`:
   - `masterPlan`, `autonomousMode`, `preparedAt`, `pendingPhases`
3. Record external execution handoff command from phase-runner output:
   - `.claude/scripts/agent-loop.sh <plan-dir>`
4. Resume main orchestrator verification only after phase execution updates are reflected in `phase-status.yaml`.

### 3.5 Fix Forward Post-Review

After `codex-review-code`, apply fix-forward policy:
1. **REJECT (CRITICAL)** → Re-enter implementation, do NOT merge
2. **FIX-FORWARD (HIGH)** → Merge allowed. Append tasks to `fixForward.tasks[]`.
   - Log each task in session-logger
   - Include in commit message: `[fix-forward: N tasks]`
3. **MERGE-NOTE (MEDIUM)** → Merge allowed with warning in notes
4. **APPROVE** → Merge normally

Fix-forward tasks carry over to next session via `session-logger` HANDOFF.md.

### 4. Record results
Save final analysisContext to `.claude/docs/moonshot-analysis.yaml`.

## Error handling

1. **Skill failure**: record in notes, report to user
2. **Undefined step**: ask user, stop
3. **Question loop**: max 3 rounds, then proceed with defaults
4. **Token limit**: archive and summarize before continuing

## Contract
- Orchestrates only, does not analyze directly
- Patch merging: shallow object merge
- User questions: `AskUserQuestion` on Claude runtime; on Codex runtime, prioritize `codex-validate-plan`/`codex-review-code` outputs and ask user only for unresolved blockers
- Build-only boundary: if upstream product-definition work is still missing, route to `product-orchestrator` instead of inventing product artifacts inside the build chain
- Product-package handoff: when `PLAN.md` + `tasks/*.md` exist, treat them as the planning source of truth and skip `requirements-analyzer` / `context-builder`
- Follow `document-memory-policy.md`
