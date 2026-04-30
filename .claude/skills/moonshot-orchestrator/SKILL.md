---
name: moonshot-orchestrator
description: Use for bounded implementation work that already has enough context and does not need the phase harness.
---

# PM Orchestrator

## Role
Run PM analysis skills in sequence, resolve execution plane and workflow profile, then build the final agent chain.

This orchestrator is the **build control plane**.

Use it directly when:
- the request is already implementation-oriented
- a product package already exists under `{tasksRoot}/{feature-name}/product/`
- the work is bounded enough that it does not need the phase harness

Do not treat it as the primary entry point for raw idea shaping.
If the request is still in product-definition mode and no product package exists, redirect upstream to `product-orchestrator`.
If the work is large, long-running, or organized around phase documents, redirect upstream to `moonshot-phase-runner`.

## Usage

```bash
/moonshot-orchestrator <user-request>
/moonshot-orchestrator <user-request> --use-teams
/moonshot-orchestrator <user-request> --use-teams=review-team
/moonshot-orchestrator <user-request> --use-teams --team-pattern=fanout-fanin
```

> Available teams: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. Details in `moonshot-teams-runner/SKILL.md`.

When team mode is enabled, prefer choosing a collaboration `pattern` first, then the concrete team preset.

## Entry Policy

- Use this skill by default for bounded code work.
- Do not use this as the default entrypoint for large phase-based work; prefer `moonshot-phase-runner`.
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
- `codex`: execute the same chain with native tools while keeping the current Codex session as the coordinator boundary.
  - Read-only review and verification owners must preserve fork semantics by default: launch fresh isolated review/verifier attempts, pass minimal artifact-backed input, and merge back structured summaries only.
  - Steps documented as `Task (fork)` must preserve isolation by passing minimal input and merging summarized output only.
  - If the active runtime cannot preserve fork semantics for a read-only review or verification owner, current-session execution is a degraded fallback and must be recorded in workflow evidence.
  - Uncertainty/question handling must use `codex-validate-plan` (planning) and `codex-review-code` (post-implementation) outputs first.
  - Ask user only when those outputs still indicate unresolved blocking items.
- In both runtimes, phase/adaptor paths must preserve policy through `SPRINT_CONTRACT.md` policy anchors rather than assuming chat memory survives across rounds.
- Human approval belongs to planning closeout only; once execution starts, do not insert approval checkpoints into implementation -> review -> verify -> retry loops unless a true blocker or external dependency requires user input.
- Cross-runtime policy source of truth:
  - Keep workflow policy in skills/orchestrator state.
  - `commands`/hooks are optional adapters and must only route to skills.

### Codex Rule References

When `executionRuntime == codex`, do not assume `.claude/rules/**` is preloaded.

Apply these rule files explicitly through the orchestrator and downstream artifact contracts:
- `.claude/rules/basic-principles.md`
- `.claude/rules/workflow.md`
- `.claude/rules/context-management.md`
- `.claude/rules/communication.md`
- `.claude/rules/output-format.md`

For `meta_harness` work, also apply:
- `.claude/rules/skills/skill-definition.md` when touching `.claude/skills/**`
- `.claude/rules/agents/agent-definition.md` and `.claude/rules/agents/agent-delegation.md` when touching `.claude/agents/**`
- `.claude/rules/docs/documentation.md` when touching `.claude/docs/**`
- `.claude/docs/guidelines/external-skill-pattern-transfer.md` when adopting or comparing external skills/harnesses

## Context Budget Rule

> **CRITICAL**: Protect main session context from pollution.

1. **No file content inlining**: Record paths only in `analysisContext`, never paste file contents.
2. **Sub-skill results**: Merge only summarized output into notes (max 5 lines per result).
3. **Notes cap**: When notes array exceeds 10 items, archive oldest items.
4. **Review results**: Extract key issues only from `codex-review-code` output.
5. **Fork returns**: Accept only structured summaries from fork agents, never raw data.
6. **Read-only review/verify inputs**: pass artifacts, changed-file lists, and concise summaries, never full session history.
7. **Fork focus**: each forked agent should pursue one tactic or hypothesis; split unrelated research/review questions into separate fork inputs.

## Workflow

### 1. Initialize analysisContext

Initialize from the canonical contract:
- `.claude/schemas/analysis-context.schema.yaml`

Resolve these fields before bundle selection:
- `request.userMessage`
- `signals.executionPlane`
- `signals.workflowProfile`
- `phase`
- `complexity`
- `decisions.bundleChain`
- `decisions.skillChain`
- `artifacts.tasksRoot`
- `artifacts.executionRoot`
- `workflowEvidence.selectedBundles`
- `workflowEvidence.requiredSkills`
- `workflowEvidence.stageOrder`

Contract rules:
- Treat `.claude/schemas/analysis-context.schema.yaml` as the single source of truth for field layout and defaults.
- Do not re-embed the full contract into downstream skills or adapters.
- Save final `analysisContext` to `.claude/docs/moonshot-analysis.yaml`.

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
> Apply `.claude/docs/guidelines/memorygraph-workflow.md`; default mode is read-only and `.claude/docs/ko/` is excluded.

```
Task tool: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, stage, changedFiles, taskType, userRequest, memoryMode: "read_only" }
Returns: projectMemoryContext -> merge into analysisContext.projectMemory
```

Run stage-scoped recalls before delegating work:
- `stage=intake`: before classification/bundle selection.
- `stage=plan`: before requirements/context/plan validation tasks.
- `stage=execute`: before implementation delegation; pass summarized deltas only.
- `stage=verify`: before final verification.
- `stage=finish`: before handoff/logging.

Do not merge MemoryGraph entries that duplicate system, developer, `AGENTS.md`, `.claude/rules/**`, or workflow hard rules; record them in `projectMemory.omitted.duplicatedSystemRules`.

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
- `planningReady`
- `executionReady`

Routing rule:
- If `productDefinitionRequest == true` and `productPackageReady == false`, hand off to `product-orchestrator`
- If `productPackageReady == true`, skip upstream planning stages and use the handoff package as the implementation baseline
- Prefer `readiness.planningReady` as the canonical "package is routable" signal
- Prefer `readiness.executionReady` as the canonical "active slice may execute now" signal

#### 2.0.6a Team pattern selection

When `signals.useAgentTeams == true`, resolve the collaboration pattern before selecting a concrete team preset.

Pattern-first routing order:

1. infer the dominant work shape
2. choose one of:
   - `fanout-fanin`
   - `producer-reviewer`
   - `supervisor`
   - `hierarchical-delegation`
   - `pipeline`
3. select the matching team from `.claude/templates/agent-teams-config.yaml`
4. record the decision in `teamSelection`
5. append a summarized note and workflow evidence entry

Default mapping:

- early analysis/research/review => `fanout-fanin`
- adversarial verification or competing hypotheses => `producer-reviewer`
- recovery routing after failures => `supervisor`
- multi-owner implementation or cross-layer work => `hierarchical-delegation`
- reserve `pipeline` for future sequential stage teams; do not force-fit an existing parallel team into this pattern

#### 2.0.7 Execution bridge defaults

For `product_project` work, treat execution artifacts as first-class state:
- `SPRINT_CONTRACT.md` defines the current slice goal, non-goals, done checks, and evaluator focus
- `QA_REPORT.md` records verifier findings and feeds the next remediation round
- `HANDOFF.md` captures resumable state when the run is interrupted, retried, or context pressure is high
- `SCORECARD.md` is the objective completion scoreboard for the active slice
- prefer an explicit scorecard profile when project policy already knows the workload type; otherwise auto-select from `generic`, `saas`, `api-backend`, `frontend`, or `platform`
- when `REQUIREMENTS_TRACEABILITY.md` and `SCENARIO_MATRIX.md` exist, rebalance only the combined `REQ + SCN` score budget from detected `REQ-*` / `SCN-*` counts; keep `VER` / `CLOSE` at the preset baseline

Policy:
- medium/complex product work must not enter code changes without a slice-level sprint contract
- strict or `meta_harness` phase work must keep policy anchors and required verification commands current in the active sprint contract
- verification steps must update `QA_REPORT.md` whenever they run
- meaningful implementation or verification rounds must update `SCORECARD.md` with objective checklist status, current score, unmet items, and verdict
- successful or partially successful implementation rounds must run doc-ops finalization before completion is claimed
- failed verification, retry loops, or interrupted runs should mark `signals.handoffRequired = true`
- retry and verification loops should remain autonomous; do not treat human approval as a normal stage between execute/review/verify rounds
- bounded direct work that stays outside the phase harness must still keep `workflowEvidence` current in `.claude/docs/moonshot-analysis.yaml`
- bounded direct `workflowEvidence` must include `selectedBundles`, `requiredSkills`, and `stageOrder`
- bounded direct code changes must record `codex-review-code` evidence before final verification is treated as stable
- bounded direct code changes must record whether `code-simplifier` was applied or explicitly skipped with a reason
- bounded direct code changes must record `doc-auto-sync` evidence before completion is claimed
- bounded direct interrupted runs must record `session-logger` evidence before completion is claimed
- external skill patterns must be transferred into existing stage owners, references, templates, or deferred pilot entries before adding a new public skill
- after a user correction that reveals a reusable workflow mistake, classify the correction through `failure-analyzer`; use `session-logger` only when session/handoff logging is already required or solution promotion is justified

#### 2.0.8 Project reference docs

For `product_project` work, treat these project docs as first-class references when present:
- `workflow/README.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `TEST_GUIDE.md`
- `docs/analysis/README.md` and relevant `docs/analysis/*.md`

Policy:
- do not block solely because one of these files is missing
- if the project doc set is missing or stale, surface it through `pre-flight-check` and prefer `project-md-refresh`
- implementation, verification, naming, and logging steps should prefer these docs over ad-hoc guesses when they exist

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

#### 2.5a Sideways replan guard

If implementation evidence, review findings, or verification output shows the selected plan is invalid:

1. stop the current implementation tactic
2. record the evidence in `analysisContext.notes` and `QA_REPORT.md` when present
3. re-run uncertainty detection and sequence decision
4. continue only after the updated plan, retry tactic, or user-approved replan is recorded

#### 2.6 Sequence decision
Run `/moonshot-decide-sequence` -> merge patch (`phase`, `bundleChain`, `skillChain`, `parallelGroups`)

#### 2.7 Stage-chain normalization

Normalize the selected chain against the repo stage model:

- `read_only`:
  - stop before implementation stages
- bounded `product_project`, simple:
  - `plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`
- bounded `product_project`, medium/complex:
  - `plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`
  - require explicit execution bridge artifacts
- phase-based work:
  - hand off to `moonshot-phase-runner`, then preserve the same downstream stage order inside each phase

Never collapse `review -> verify -> finish` into a single undifferentiated closeout step when code changed meaningfully.

### 3. Execute the agent chain

Run `decisions.skillChain` in order.

**Allowed steps:**

| Step | Type | Notes |
|------|------|-------|
| `pre-flight-check` | Skill | emits readiness signals |
| `teach-impeccable` | Skill | design-context bootstrap for UI work |
| `frontend-design` | Skill | visual direction and anti-pattern guard for UI implementation |
| `audit` | Skill (fork) | review-only UI quality audit |
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
| `code-simplifier` | Skill | post-implementation simplification pass |
| `completion-verifier` | Skill (fork) | contract-aware verification |
| `verification-evidence-gate` | Skill | strict profile evidence-before-completion gate |
| `doc-auto-sync` | Skill | auto-docs update & bootstrap |
| `codex-review-code` | Skill (fork) | |
| `project-memory-reviewer` | Task (fork) | context isolation |
| `vercel-react-best-practices` | Skill | when reactProject=true |
| `security-reviewer` | Skill (fork) | |
| `build-error-resolver` | Skill | |
| `browser-verifier` | Skill (fork) | runtime check for web projects |
| `web-design-guidelines` | Skill (fork) | guideline-based UI review |
| `verify-runtime.sh` | Bash | runtime URL/E2E verifier |
| `verify-changes.sh` | Bash | verdict-emitting project verifier |
| `efficiency-tracker` | Archived deprecated skill | Historical reporting only; not loaded in default chains |
| `session-logger` | Skill | |
| `moonshot-phase-runner` | Skill | |
| `moonshot-phase-executor` | Skill | |
| `moonshot-in-session-coordinator` | Skill | |
| `moonshot-teams-runner` | Skill | |
| `team-leader-agent` | Task (fork) | teams coordination |
| `failure-analyzer` | Skill (fork) | system failure analysis |
| `workflow-self-improver` | Archived deprecated skill | Historical workflow reflection only; not loaded in default chains |
| `commit-moonshot` | Skill | |

**Agent mapping:**

| Agent | subagent_type | Notes |
|-------|---------------|-------|
| `project-memory-agent` | general-purpose | fork, before 2.1 |
| `project-memory-check` | general-purpose | fork, check-only mode before implementation (`.claude/agents/project-memory-check.md`) |
| `requirements-analyzer` | general-purpose | |
| `context-builder` | context-builder | |
| `implementation-runner` | implementation-agent | |
| `phase-attempt-agent` | general-purpose | fork, single phase attempt via coordinator |
| `project-memory-reviewer` | general-purpose | fork, after codex-review-code |
| `team-leader-agent` | general-purpose | fork, --use-teams |

**Execution rules:**
1. Run steps sequentially (parallelize only within `parallelGroups`)
2. Runtime routing:
   - `claude-code`: Skill → `Skill` tool, Agent → `Task` tool, Plugin → `Plugin` tool, Script → `Bash` tool
   - `codex`: run equivalent logic in-session with native tools/shell while preserving step contracts
3. For `Task (fork)` semantics and read-only review/verification skills with `context: fork`, keep context isolation (minimal input, summarized return only) in both runtimes
4. Undefined step → ask user and stop
5. All steps must follow `document-memory-policy.md`
6. If `product-orchestrator` is selected, treat it as a redirect/handoff boundary and do not continue the build chain in the same pass unless a product package is returned
7. If `signals.phaseLoopInSession == true`, keep the main session as a thin coordinator and do not perform direct multi-round implementation work in that session.

**Execution bridge contract**:
- Before the first `implementation-runner` in medium/complex `product_project` work, materialize `artifacts.sprintContractPath`
- Before the first `implementation-runner` in medium/complex `product_project` work, materialize `artifacts.scorecardPath`
- `implementation-runner` must treat `SPRINT_CONTRACT.md` as the round-level source of truth for code edits
- `implementation-runner` and subsequent remediation rounds must keep `SCORECARD.md` current
- `completion-verifier`, `verify-runtime.sh`, and `verify-changes.sh` should update `artifacts.qaReportPath`
- `verify-changes.sh` score output is the preferred completion score source when available
- after verification or review, `doc-auto-sync` must run before completion is claimed
- If verification fails, retries begin, or the session cannot finish cleanly, write/update `artifacts.handoffPath`

**Review cadence contract**:
- simple bounded changes: one post-implementation review is usually enough
- medium changes: review after the first meaningful implementation batch and again after code-changing remediation
- complex/long-running changes: review the plan, then each meaningful implementation batch, then each remediation batch that changes behavior or contracts
- when review is skipped, record why in notes or workflow evidence

**Finish / handoff contract**:
- `finish-bundle` is entered only after the active review/verify verdict is stable
- if in-scope work still remains and no real stop condition exists, continue execution; a validated checkpoint or refreshed docs are not sufficient reasons to stop
- clean finish:
  - verification passed with fresh evidence
  - in-scope work for the requested run is complete
  - score verdict is `done`
  - run `doc-auto-sync`
  - run `session-logger` when resumable state or decision history matters
- resume-later handoff:
  - allowed only for `blocked`, `interrupted`, `context_limit`, `user_pause`, or `deferred_verification`
  - update `QA_REPORT.md`
  - update `HANDOFF.md`
  - do not claim completion
- explicit commit path:
  - only run `commit-moonshot` when the user asked for memory update plus commit

**Phase-runner execution-mode contract**:
- If `moonshot-phase-runner` returns `phaseRunnerResult.prepareOnly == true`, stop after surfacing prepared execution metadata.
- If `moonshot-phase-runner` returns `phaseRunnerResult.autoStartExecution == true`, execute `phaseRunnerResult.executionSkill` immediately and pass through `phaseRunnerResult`.
- If `phaseRunnerResult.executionMode == delegated-terminal`, the execution path must launch `phaseRunnerResult.executionCommand` and remain attached to the dispatcher/agent loop until that loop exits.
- Do not downgrade delegated-terminal into a single conversational implementation round just because artifacts or checkpoints were updated.
- Do not treat a completed phase as a return boundary while the active plan directory still contains `pending`, `in_progress`, or retryable `failed` phases.
- In auto-start execution, keep a live `phase-run-lease` attached to the run and require `assert-return-allowed` to pass before any success summary can escape the dispatcher boundary.
- If `moonshot-phase-runner` returns `phaseRunnerResult.executionMode == in-session-coordinator`:
  - set `signals.phaseLoopInSession = true`
  - keep the main session in coordinator mode only
  - insert `moonshot-in-session-coordinator` as the phase execution boundary
  - run each implementation round as a fresh fork/sub-agent attempt
  - pass only artifact-backed input (`phaseDoc`, `SPRINT_CONTRACT.md`, latest `QA_REPORT.md`, optional `HANDOFF.md`)
  - merge back summarized `attemptResult` only
  - treat `attemptResult.status == completed` as valid only when the underlying verifier state is `passed`, `evidenceFresh == true`, and required checks are complete

**Memory-step separation contract**:
- `project-memory-agent`: read-only MemoryGraph recall at each stage boundary; write only when `memoryMode: write_requested`
- `project-memory-check`: pre-implementation boundary check (check-only, no memory mutation, use `.claude/agents/project-memory-check.md`)
- `project-memory-reviewer`: post-review boundary compliance verification

**Agent Teams Integration (--use-teams):**
1. Set `signals.useAgentTeams = true`
2. Resolve `teamSelection.selectedPattern` before choosing `teamSelection.selectedTeam`
3. Fork `team-leader-agent` with the selected team config (see `moonshot-teams-runner/SKILL.md` for team details)
4. Merge summarized `teamReport` into `analysisContext.notes`
5. Record `selectedPattern`, `selectedTeam`, and `selectionReason` in notes or workflow evidence

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
| `implementationComplete=true` | meaningful file edits detected | Ensure `doc-auto-sync` is present after verification and before completion |
| `buildFailed` | `verify-changes.sh` exit `1` | Insert `build-error-resolver`, retry (max 2) |
| `testFailed` | `verify-changes.sh` exit `2` | Re-enter `implementation-runner` with test-first remediation, then rerun verification |
| `runtimeUnavailable` | `verify-runtime.sh` exit `1` | Request server/runtime readiness fix, rerun `browser-verifier` (max 1) |
| `e2eFailed` | `verify-runtime.sh` exit `2` | Apply same policy as `testFailed` |
| `browserFlowFailed` | `verify-runtime.sh` exit `3` | Re-enter runtime/browser remediation path, then rerun `browser-verifier` |
| `reviewRequired` | meaningful code changes or medium+ complexity | Insert `codex-review-code` before final verification |
| `verificationFailed` | `completion-verifier` or runtime verifier fails | Update `QA_REPORT.md`, re-enter implementation with contract-linked findings |
| `planInvalidated` | review, runtime evidence, or implementation findings contradict the selected plan | Stop the current tactic, update notes/QA evidence, and re-enter uncertainty handling plus sequence decision |
| `finishRequired` | meaningful file edits with stable verifier state | Insert `doc-auto-sync` and `session-logger` before final completion statement |
| `docStale` | pre-flight-check detects stale doc | Insert `doc-auto-sync` at start of chain, but still keep final doc-ops after implementation |
| `securityConcern` | changed files contain `.env`/`auth`/`token`/`secret` | Add `security-reviewer` after `codex-review-code` |
| `coverageLow` | `completion-verifier: coverage < 80%` | Log warning, request additional tests |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `frontend-design` before `implementation-runner` |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `vercel-react-best-practices` after `codex-review-code` |
| `implementationComplete` | implementation-runner completed with meaningful code changes | Insert `code-simplifier` before `completion-verifier` |
| `docStale` | pre-flight-check detects stale doc | Insert `doc-auto-sync` at start of chain |
| `phasePlanDetected` | master plan + phase docs found | Insert `moonshot-phase-runner` before `implementation-runner` |
| `phaseAutoStart` | `phaseRunnerResult.autoStartExecution == true` | Execute `phaseRunnerResult.executionSkill` immediately with `phaseRunnerResult` as input |
| `phaseLoopInSession` | `phaseRunnerResult.executionMode == in-session-coordinator` | Insert `moonshot-in-session-coordinator` and keep each round in a fresh fork/sub-agent attempt |
| `handoffRequired` | retry loop, interruption, or context budget warning | Update `HANDOFF.md` through `session-logger` before pausing |
| `strictProfile` | `workflowProfile == strict` and no evidence step | Insert `verification-evidence-gate` after `completion-verifier` or `verify-changes.sh` |
| `multipleFailures` | notes contain > 2 errors/failures | Append `failure-analyzer`; escalate to replan when the same failure class repeats |
| `userCorrection` | user correction reveals a repeatable workflow or quality mistake | Append `failure-analyzer`; use `session-logger` only for active session/handoff logging or solution promotion |

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
3. Proceed only when:
   - `completionStatus.verificationState == passed`
   - and `completionStatus.evidenceFresh == true` when a contract-backed verdict is expected
   - and `completionStatus.requiredChecks.missing` is empty when required checks apply
4. If `completionStatus.verificationState == indeterminate`:
   - strict -> treat as failure
   - standard -> record `pass_with_warning`
5. If `completionStatus.verificationState == passed` but fresh evidence is missing or required checks are incomplete:
   - contract-backed run -> reclassify as `verificationFailed`, update `QA_REPORT.md`, and re-enter remediation/retry flow
   - non-contract fallback/workspace run -> do not claim completion; keep the run in warning/remediation state according to profile
5. Update `artifacts.qaReportPath` with verdict, failed criteria, and next-round input.
6. If strict, run `verification-evidence-gate` before any completion statement.
7. If review changed code after verification started, rerun affected verification steps before closeout.
8. On failure, retry using exit-code strategy until retry cap is reached.
9. If the run stops before clean completion, write `artifacts.handoffPath`.

### 3.4 State Transition Table

| Verifier state | Transition |
|---|---|
| `passed` + fresh evidence + required checks complete | eligible for completion |
| `passed` without fresh evidence or with missing required checks | reclassify to remediation/retry; no completion claim |
| `indeterminate` | strict=`failed`, standard=`pass_with_warning` |
| `failed` | retry or fail |

### 4. Record results
Save final `analysisContext` to `.claude/docs/moonshot-analysis.yaml`.
When the run is bounded-direct and edits code, keep `QA_REPORT.md` workflow evidence current, then record the boundary through `bash .claude/scripts/workflow-enforcement.sh record-bounded --analysis-path .claude/docs/moonshot-analysis.yaml`.
`record-bounded` normalizes `workflowEvidence` in the analysis file, fills canonical bundles/required skills/stage order, and syncs applied/skipped evidence from `QA_REPORT.md` when that artifact is provided.

## Contract
- Orchestrates only, does not analyze directly
- Patch merging: shallow object merge
- User questions: `AskUserQuestion` on Claude runtime; on Codex runtime, prioritize `codex-validate-plan`/`codex-review-code` outputs and ask user only for unresolved blockers
- Build-only boundary: if upstream product-definition work is still missing, route to `product-orchestrator` instead of inventing product artifacts inside the build chain
- Product-package handoff: when `PLAN.md` + `tasks/*.md` exist, treat them as the planning source of truth and skip `requirements-analyzer` / `context-builder`
- Execution bridge: medium/complex `product_project` work must keep `SPRINT_CONTRACT -> QA_REPORT -> HANDOFF` artifacts synchronized with the active slice
- In-session phase loops: allowed only when retries run through fresh isolated attempts; the coordinator session must stay summary-only between rounds
- Do not convert a phase-attempt summary into a completion claim unless the verifier evidence for that attempt is fresh and contract-complete
- Phase attempt mode: when a fresh attempt runs `moonshot-orchestrator`, set `signals.phaseAttemptMode = true` and skip recursive `moonshot-phase-runner` insertion
- Follow `document-memory-policy.md`
