---
name: moonshot-phase-runner
description: Use for large, phase-based, or long-running implementation work that should run from a prepared plan package.
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Moonshot Phase Runner

## Role

Prepares phase-by-phase implementation based on master plan documents.
Handles plan validation, uncertainty resolution (Q&A), and **execution preparation**.
Emits handoff metadata so `/moonshot-orchestrator` can resume with consistent state.

This is the default public entrypoint for large, phase-based, or long-running implementation work.
It owns the Intake-to-Plan transition for phase-driven execution.

## Codex Rule References

When the active runtime is Codex, phase preparation must not rely on automatic `.claude/rules/**` loading.

Carry these rule files through `SPRINT_CONTRACT.md` policy anchors and phase-attempt inputs:
- `.claude/rules/basic-principles.md`
- `.claude/rules/workflow.md`
- `.claude/rules/context-management.md`
- `.claude/rules/communication.md`
- `.claude/rules/output-format.md`
- `.claude/rules/agents/agent-definition.md`
- `.claude/rules/agents/agent-delegation.md`
- `.claude/docs/guidelines/product-acceptance-gate.md`
- `.claude/docs/guidelines/memorygraph-workflow.md`

Execution modes:
- `delegated-terminal`: use the concrete autonomous loop backed by `agent-loop.mjs`; prefer this when the user expects uninterrupted end-to-end execution
- `in-session-coordinator`: the current session coordinates the loop, but each attempt must run as a fresh fork/sub-agent round; treat this as an interactive thin-coordinator mode, not the default autonomous runtime

Effort profile policy:
- Default phase, agentic, review, and high-risk work to `standard`.
- Use `economy` only for parity smoke or narrow read-only checks.
- Use `standard` for simple/local bounded work.
- Use `deep` or `max` only when runtime/core/architecture/security risk, failed retry evidence, or hard long-horizon work justifies escalation.
- Every `deep` or `max` run must record `Effort escalation reason` in `SPRINT_CONTRACT.md`, `QA_REPORT.md`, and workflow evidence.
- Model selection is provider-neutral and automatic. Codex maps the selected route to `-m` plus `model_reasoning_effort`; Claude Code maps it to `--model` plus `--effort`.
- Evidence must include `selectedModelProvider`, `selectedModel`, `selectedModelEffort`, and `modelSelectionReason`.

Retrieval and validation policy:
- Default retrieval budget is one compact MemoryGraph/CodeReviewGraph recall per stage.
- Repeat retrieval only for missing owner, date, path, API/schema, or failure fact.
- Stop retrieving when the core stage decision is answerable with compact evidence.
- Use `validationProfile` values from `.claude/verification.contract.yaml`: `prompt_only`, `docs_only`, `script_change`, `workflow_core`, or `runtime_adapter`.

Phase replay policy:
- For long-running or tool-heavy Responses-style integrations, preserve assistant-item `phase` values when replaying assistant history.
- Use `commentary` for progress/preamble updates and `final_answer` only after return-boundary checks pass.
- Do not add `phase` metadata to user messages.

Execution start policy:
- default: auto-start execution immediately after preparation
- `--prepare-only`: stop after seeding state and return prepared execution metadata without executing it

Intent interpretation:
- Treat requests such as "continue", "proceed with the improvement work", "go ahead", "execute the phase", or equivalent user wording as execution intent, not packaging intent.
- Unless the user explicitly asks for planning/package-only behavior or passes `--prepare-only`, the runner must set `prepareOnly: false` and `autoStartExecution: true`.
- For Codex or other runtimes where uninterrupted completion is the goal, prefer `delegated-terminal` unless the user explicitly wants interactive coordination or the runtime can only satisfy the request through `in-session-coordinator`.

Plan-directory completion rule:
- In default auto-start runs, the execution boundary is the entire active plan directory, not the current phase.
- If any phase in `phase-status.yaml` remains `pending`, `in_progress`, or retryable `failed`, the run must keep going through the delegated-terminal loop or the in-session coordinator loop.
- A completed phase boundary is never a valid stop boundary by itself.

Automatic phase parallelization rule:
- Do not ask the user to choose a parallel phase count. The delegated-terminal loop owns automatic phase-wave planning.
- Before selecting a single next phase, `agent-loop.mjs` must ask `phase-parallel-planner.mjs` to scan all actionable pending phases.
- If the planner proves that two or more phases have no unmet dependencies, no target path overlap, and no manual/external-state ambiguity, the loop may route that wave through `phase-wave-coordinator.mjs`.
- Parallel phase workers must run in isolated Git worktrees. They must not write the shared main `phase-status.yaml` concurrently; the coordinator serializes merge and status updates after successful phase closeout.
- If the planner or coordinator cannot prove safety, the loop must fall back to the existing sequential next-phase path and record the fallback reason.
- `PHASE_PARALLEL_AUTO=false` is the only kill switch. It is for emergency/runtime debugging, not normal user-facing workflow selection.

Goal runtime state rule:
- Runtime state is hybrid: SQLite owns machine state, Markdown/YAML artifacts own human/audit evidence.
- SQLite path defaults to `.claude/runtime-state.sqlite` and is ignored by git. Override with `PHASE_RUNTIME_DB` only for tests or explicit alternate workspaces.
- Store `goalRuntime`, lease, pause/resume/clear, budget/accounting, and event log state in SQLite; do not move `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, or verification reports into the DB.
- The default long-running path remains `delegated-terminal`. Do not create a second public runner for goal mode; goal runtime is a control layer around the existing phase loop.
- Use `node .claude/scripts/phase-goal-control.mjs status|pause|resume|clear <plan-dir>` to inspect or control the active goal. `pause` prevents the next continuation/attempt from starting; it does not delete artifacts.

Channel / return-boundary rule:
- While `phase-status.yaml` reports `activeExecutionStatus: active`, user-facing updates must stay in progress/commentary form.
- Do not emit a `final` answer, closeout phrasing, or any wording that implies the run/session ended until `assert-return-allowed` passes or an explicit stop condition is recorded.
- A phase milestone, refreshed execution artifacts, or a just-started next phase is not a valid terminal-response boundary.

Review and finish gate rule:
- The phase package may not be treated as complete until the required review and finish-closeout steps have actually run.
- For code-changing phases, `codex-review-code` must appear in applied workflow evidence before `clean_finish` is allowed.
- `QA_REPORT.md` may not claim `Next path: clean_finish` while `Review completed` is still `no`.
- `HANDOFF.md` and closeout fields may not remain seeded or placeholder-shaped when the phase is being closed.
- Before a plan-directory completion summary, run `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir <plan-dir> --master-plan <master-plan>` and block return if it fails.
- Phase closeout requires master checklist, `phase-status.yaml`, archived phase document paths, execution artifacts, verifier verdicts, scorecards, and critical `SCN-*` evidence to agree.
- If review or closeout evidence is missing, the run must stay inside the active plan-directory loop and remediate the missing steps instead of returning a summary.

MemoryGraph stage rule:
- Apply `.claude/docs/guidelines/memorygraph-workflow.md` across the phase run.
- The runner owns Intake and Plan recall before it delegates to plan writing, plan review, or execution.
- Each execution attempt must receive summarized `projectMemoryContext`; do not inline raw MemoryGraph records into phase docs or attempt input.
- Exclude `.claude/docs/ko/` and omit MemoryGraph entries that duplicate system/developer/AGENTS/rules policy.
- MemoryGraph unavailable -> record `boundaryStatus: not_checked` and continue unless a strict memory gate explicitly fails.

## Usage

```bash
# Auto-resolve an existing plan or create one at docs/implementation
/moonshot-phase-runner

# Specify plan directory
/moonshot-phase-runner docs/implementation/

# Autonomous mode (skip Q&A)
/moonshot-phase-runner docs/implementation/ --autonomous

# Keep coordination in the current session
/moonshot-phase-runner docs/implementation/ --execution-mode in-session-coordinator

# Prepare only, do not auto-start execution
/moonshot-phase-runner docs/implementation/ --prepare-only
```

## Workflow

```
/moonshot-phase-runner [<plan-dir>] [--autonomous] [--execution-mode <mode>] [--prepare-only]
    │
    ├─ 0. MemoryGraph Intake Recall
    │      └─ Run `project-memory-agent` with stage=intake/read_only
    │         and merge only summarized `projectMemoryContext`
    │
    ├─ 1. Plan Directory Resolution
    │      ├─ Reuse explicit `<plan-dir>` when provided
    │      ├─ Else reuse existing active plan directory if exactly one safe candidate exists
    │      └─ Else run `moonshot-plan-writer` to create `docs/implementation`
    │
    ├─ 2. Plan Directory Validation
    │      └─ Verify master plan + phase docs exist
    │
    ├─ 3. Create/Update phase-status.yaml
    │      └─ Initialize each phase status
    │
    ├─ 4. Seed execution bridge artifacts
    │      └─ Prepare `execution/<phase>/SPRINT_CONTRACT.md`
    │         and placeholders for `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`
    │
    ├─ 5. Plan Review (unless --autonomous)
    │      └─ Refresh MemoryGraph with stage=plan/read_only, then detect uncertainties → Q&A → planConfirmed: true
    │
    ├─ 6. Resolve Execution Mode
    │      ├─ delegated-terminal -> build dispatcher command
    │      └─ in-session-coordinator -> build fresh-attempt command
    │
    ├─ 7. Auto-Start Execution Skill (default)
    │      └─ Refresh MemoryGraph with stage=execute/read_only, then execute `moonshot-phase-executor` in the current session
    │         unless `--prepare-only` was requested
    │
    ├─ 8. Automatic Phase-Wave Planning (delegated-terminal)
    │      └─ Scan pending phases, run independent waves in isolated worktrees when safe,
    │         otherwise use the sequential next-phase path
    │
    ├─ 9. Enforce Review / Finish Gates
    │      └─ A phase may advance only after MemoryGraph review, review evidence, completion evidence,
    │         acceptance evidence, and finish-closeout artifacts are consistent
    │
    └─ 10. Emit Handoff Summary
           └─ Orchestrator-readable phaseRunnerResult after the active plan directory is actually done
```

## Step 1: Plan Directory Resolution

When `<plan-dir>` is omitted, resolve it in this order:

1. Reuse the active plan from `.claude/docs/phase-status.yaml` if it points to an existing master plan.
2. Reuse `docs/implementation` if it already contains exactly one valid master plan and phase files.
3. Reuse another single valid implementation-plan directory only if exactly one safe candidate exists.
4. Otherwise run `/moonshot-plan-writer` and create or refresh `docs/implementation`.

Archived phase docs under `<plan-dir>/close/` are history, not active phase candidates.

Safety rule:
- If multiple candidate plan directories exist and there is no clear active one, stop and ask the user instead of guessing.

Resolution output:

```yaml
planResolution:
  source: "phase-status"   # explicit | phase-status | discovered | plan-writer
  planDir: "docs/implementation"
  masterPlan: "docs/implementation/00-master-plan-v1.md"
```

## Step 2: Plan Directory Validation

```yaml
validation:
  - Check directory exists
  - Find master plan (00-master-plan.md or *master*.md)
  - Count phase documents

output:
  success: "✅ Found {N} phases in {plan-dir}"
  failure: "❌ Master plan not found"
```

## Step 3: Create phase-status.yaml

Creates `.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionMode: "in-session-coordinator"
executionRoot: "docs/implementation/execution"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
    attempts:
      total: 0
      lastOutcome: pending
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

When a phase reaches `completed`, move its phase doc into `<plan-dir>/close/` and record `archivedPhaseDoc` in `phase-status.yaml` so active discovery stays clean.

## Step 4: Seed Execution Bridge Artifacts

For each detected phase, prepare:
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`
- `<plan-dir>/execution/<phase>/SCORECARD.md`

Rules:
- `SPRINT_CONTRACT.md` is seeded from the phase title and document path
- seed artifacts from the execution templates under `.claude/templates/execution/`
- `SPRINT_CONTRACT.md` must carry `Policy Anchors` for always-loaded rules, the active workspace contract, the verification contract, and any phase-specific guides required for the round
- `SPRINT_CONTRACT.md` must carry `Harness Selection` and `Contract Review` fields before implementation begins
- `SPRINT_CONTRACT.md` should also declare the expected downstream stage order, review cadence, and finish/handoff exit rule for the round
- `QA_REPORT.md` and `HANDOFF.md` start as placeholders and are updated during execution
- `SCORECARD.md` starts with objective weighted checks and controls whether the loop may declare the phase done
- `SCORECARD.md` should be seeded from a scorecard profile: `generic`, `saas`, `api-backend`, `frontend`, or `platform`
- when traceability artifacts already exist, rebalance only the combined `REQ + SCN` budget from detected `REQ-*` / `SCN-*` counts before the first attempt
- `QA_REPORT.md` should make the next path explicit: clean finish, retry loop, or resume-later handoff
- `QA_REPORT.md` should record runtime evidence depth and retry strategy when verification fails
- `HANDOFF.md` should record which review/verification checks must be rerun before closeout
- `SCORECARD.md` should keep `retry` as the default verdict until the objective target score is met
- do not overwrite an existing artifact that already contains work

## Step 5: Plan Review (Optional)

When `--autonomous` flag is **NOT** specified:

```yaml
actions:
  1. Load each phase document
  2. Run /moonshot-detect-uncertainty
  3. If uncertainties found:
     - Display questions
     - Wait for user answers
     - Update phase document
  4. Set planConfirmed: true
```

When `--autonomous` flag **IS** specified:
- Skip Q&A
- Set all phases to planConfirmed: true
- Proceed with autonomous decision mode

## Step 6: Resolve Execution Mode

Supported values:
- `delegated-terminal` (default): external loop via `agent-loop.mjs`
- `in-session-coordinator`: current session coordinates retries, but each attempt must be isolated

### Mode A: delegated-terminal

**Internal adapter command:**

```
═══════════════════════════════════════════════════════════════
  ✅ Ready
═══════════════════════════════════════════════════════════════

📋 Plan: docs/implementation/00-master-plan.md
📦 Phases: 5
🤖 Mode: Autonomous

───────────────────────────────────────────────────────────────
  Internal adapter:
───────────────────────────────────────────────────────────────

  node .claude/scripts/moonshot-phase-dispatch.mjs docs/implementation/ --execution-mode delegated-terminal --execution-root docs/implementation/execution --runtime auto

───────────────────────────────────────────────────────────────

💡 Tip: Logs available at .claude/logs/agent-loop/
```

The delegated-terminal adapter automatically evaluates phase-level parallel waves. Users do not pass a public `--parallel-phases` option. The loop runs `phase-parallel-planner.mjs`; when it returns `parallel_wave`, `phase-wave-coordinator.mjs` executes those phases in isolated worktrees and serializes their merge/status updates. Ambiguous dependency, target overlap, manual smoke, or external-state signals force sequential fallback.

### Mode B: in-session-coordinator

This mode keeps orchestration in the current session while preserving fresh-attempt isolation.
It is not the strongest choice for uninterrupted autonomous runs in runtimes that cannot enforce the fresh-attempt loop programmatically.

Coordinator rules:
- The main session may decide the next attempt, but must not carry implementation chatter across rounds.
- Each round must start from artifact state only:
  - phase document
  - `SPRINT_CONTRACT.md`
  - latest `QA_REPORT.md`
  - latest `HANDOFF.md` when present
- Treat `SPRINT_CONTRACT.md` policy anchors as required round input, not optional notes
- Keep the downstream stage order visible inside each round: `ready/isolate -> execute -> review -> verify -> finish/handoff`
- Each round must execute as a fresh fork/sub-agent attempt.
- Merge back summaries only: verdict, changed files, failed checks, next action.
- Do not treat a phase as cleanly complete until review, verification, and finish-stage closeout are all satisfied.
- Do not treat a critical `SCN-*` as cleanly evidenced by smoke-only browser/runtime checks; clean finish requires `open -> act -> mutate -> persist -> recover` or equivalent runtime evidence.
- If the same failure class repeats twice, the next attempt must choose `partial_redesign` or `stop_and_handoff`, not another unqualified same-direction retry.
- Do not stop a round only because a checkpoint produced evidence or docs were refreshed; if in-scope work remains and no real stop condition exists, continue execution.
- If the round does not finish cleanly, update `QA_REPORT.md` and `HANDOFF.md` before the next attempt.

Runtime note:
- `delegated-terminal` has a concrete Node loop (`agent-loop.mjs`) and is the preferred mode when the run should keep going without conversational re-entry.
- `.sh` wrappers remain available as compatibility entrypoints.
- `in-session-coordinator` depends on the active runtime honoring the coordinator contract and may surface a resumable handoff instead of autonomously continuing.

Attempt contract:

```yaml
attemptInput:
  phaseNumber: 1
  phaseTitle: "Project Setup"
  phaseDoc: "docs/implementation/01-project-setup.md"
  sprintContractPath: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
  qaReportPath: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
  handoffPath: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  scorecardPath: "docs/implementation/execution/01-project-setup/SCORECARD.md"
  priorAttemptSummary: "Build failed on migration ordering; retry with DB init fix"

attemptResult:
  status: "partial"
  summary: "Backend boots, but login flow still fails under E2E"
  changedFiles: ["src/api/auth.ts", "tests/e2e/login.spec.ts"]
  verification:
    verdict: "failed"
    failedChecks: ["browserFlows.login"]
  score:
    current: 70
    target: 100
    unmetChecklistItems: 2
    blockingDefects: 1
    verdict: "retry"
  handoffRequired: true
```

The coordinator can loop in the current session only if the actual implementation/verifier work happens inside these fresh attempts.

## Step 7: Auto-Start Execution Skill (Default)

Unless `--prepare-only` is set:
- execute `moonshot-phase-executor` immediately in the current session
- pass `phaseRunnerResult` as the handoff payload
- keep command adapters behind the skill boundary
- when `executionMode == delegated-terminal`, actually launch `phaseRunnerResult.executionCommand` / `executionAdapterCommand` in the current session and stay attached until that loop exits
- do not replace delegated-terminal execution with a single conversational implementation round, partial checkpoint, or one-attempt summary
- for delegated-terminal runs, the first valid return boundary is loop exit only: all phases completed, retry cap reached, explicit user pause, or a real blocking failure recorded by the loop
- after any phase is marked `completed`, immediately continue to the next actionable phase in the same active plan directory instead of returning a progress summary

When `--prepare-only` is set:
- stop after writing artifacts and `phase-status.yaml`
- surface prepared execution metadata for manual or downstream use

## Step 8: Emit Handoff Summary

Return a structured summary for orchestrator:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: in-session-coordinator
  planResolutionSource: "plan-writer"
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  executionRuntime: "auto"
  executionSkill: "moonshot-phase-executor"
  executionCommand: "node .claude/scripts/moonshot-phase-dispatch.mjs docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionAdapterCommand: "node .claude/scripts/moonshot-phase-dispatch.mjs docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionCoordinatorSkill: "moonshot-in-session-coordinator"
  coordinatorPolicy: "fresh-fork-per-attempt"
  autoStartExecution: true
  prepareOnly: false
  pendingPhases: 5
```

Mode meanings:
- `delegated-terminal`: this skill prepares state and then immediately executes the command-layer adapter invocation for the real autonomous loop
- `in-session-coordinator`: this skill prepares state and expects the orchestrator/current runtime to execute each attempt as a fresh fork

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionMode: "delegated-terminal"
executionRoot: "docs/implementation/execution"
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
    attempts:
      total: 1
      lastOutcome: failed
      lastUpdatedAt: "2026-02-08T15:30:00Z"
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core UI"
    status: pending
    planConfirmed: true
```

Optional closeout metadata:

```yaml
    archivedPhaseDoc: "docs/implementation/close/01-project-setup.md"
```

## References

- `/moonshot-orchestrator`: Phase implementation delegation
- `/moonshot-plan-writer`: Fallback plan creation when no safe plan dir exists
- `/moonshot-detect-uncertainty`: Pre-execution uncertainty detection
- `.claude/scripts/moonshot-phase-dispatch.mjs`: primary command-layer dispatcher for both execution modes
- `.claude/scripts/agent-loop.mjs`: primary autonomous execution loop behind `delegated-terminal`
- `.claude/scripts/moonshot-phase-dispatch.sh` / `.claude/scripts/agent-loop.sh`: compatibility wrappers
- `/moonshot-in-session-coordinator`: Fresh-attempt coordinator for `in-session-coordinator`

## Orchestrator Integration Contract

When called by `/moonshot-orchestrator`:
1. Resolve `<plan-dir>` first; if no safe plan exists, run `/moonshot-plan-writer` for `docs/implementation`.
2. Prepare plan state and write `.claude/docs/phase-status.yaml`.
3. Seed execution-bridge artifacts for each phase when missing.
4. Return `phaseRunnerResult` summary with `executionMode`, `executionRoot`, and artifact paths (do not inline full phase docs).
5. Do not mark implementation complete here.
6. If `prepareOnly != true`, execute `phaseRunnerResult.executionSkill` immediately and pass `phaseRunnerResult` as input.
7. If `executionMode == delegated-terminal`, the execution path must launch the dispatcher/agent loop directly and must not stop after a single partial attempt summary.
8. `partial`, `retry`, refreshed artifacts, or newly written handoff/checkpoint docs are not valid delegated-terminal stop reasons by themselves.
9. A single completed phase is not a stop reason while the active plan directory still has actionable phases.
10. In auto-start execution, keep a live `phase-run-lease` attached to the dispatcher boundary and require `node .claude/scripts/phase-run-lease.mjs assert-return-allowed <status-file> <runLeaseId> true false` to pass before any success return.
11. If `prepareOnly == true`, stop after returning the prepared execution metadata.
12. If `executionMode == in-session-coordinator`, orchestrator must keep the main session thin and run each implementation round as a fresh fork/sub-agent attempt.
13. Completion verification resumes only after the active attempt updates `phase-status.yaml` and execution artifacts.
14. Within each phase, preserve `ready/isolate -> execute -> review -> verify -> finish/handoff` as the default stage order.
15. If the user's latest message expressed execution intent and `prepareOnly == true` was not explicitly requested, treat that result as a contract mismatch and continue through the auto-start execution path instead of returning a prepared-only summary.
