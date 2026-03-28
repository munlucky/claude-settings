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

Execution modes:
- `delegated-terminal`: use the concrete autonomous loop backed by `agent-loop.sh`; prefer this when the user expects uninterrupted end-to-end execution
- `in-session-coordinator`: the current session coordinates the loop, but each attempt must run as a fresh fork/sub-agent round; treat this as an interactive thin-coordinator mode, not the default autonomous runtime

Execution start policy:
- default: auto-start execution immediately after preparation
- `--prepare-only`: stop after seeding state and return prepared execution metadata without executing it

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
    │      └─ Detect uncertainties → Q&A → planConfirmed: true
    │
    ├─ 6. Resolve Execution Mode
    │      ├─ delegated-terminal -> build dispatcher command
    │      └─ in-session-coordinator -> build fresh-attempt command
    │
    ├─ 7. Auto-Start Execution Skill (default)
    │      └─ Execute `moonshot-phase-executor` in the current session
    │         unless `--prepare-only` was requested
    │
    └─ 8. Emit Handoff Summary
           └─ Orchestrator-readable phaseRunnerResult
```

## Step 1: Plan Directory Resolution

When `<plan-dir>` is omitted, resolve it in this order:

1. Reuse the active plan from `.claude/docs/phase-status.yaml` if it points to an existing master plan.
2. Reuse `docs/implementation` if it already contains exactly one valid master plan and phase files.
3. Reuse another single valid implementation-plan directory only if exactly one safe candidate exists.
4. Otherwise run `/moonshot-plan-writer` and create or refresh `docs/implementation`.

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
- `SPRINT_CONTRACT.md` should also declare the expected downstream stage order, review cadence, and finish/handoff exit rule for the round
- `QA_REPORT.md` and `HANDOFF.md` start as placeholders and are updated during execution
- `SCORECARD.md` starts with objective weighted checks and controls whether the loop may declare the phase done
- `SCORECARD.md` should be seeded from a scorecard profile: `generic`, `saas`, `api-backend`, `frontend`, or `platform`
- when traceability artifacts already exist, rebalance only the combined `REQ + SCN` budget from detected `REQ-*` / `SCN-*` counts before the first attempt
- `QA_REPORT.md` should make the next path explicit: clean finish, retry loop, or resume-later handoff
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
- `delegated-terminal` (default): external loop via `agent-loop.sh`
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

  .claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode delegated-terminal --execution-root docs/implementation/execution --runtime auto

───────────────────────────────────────────────────────────────

💡 Tip: Logs available at .claude/logs/agent-loop/
```

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
- If the round does not finish cleanly, update `QA_REPORT.md` and `HANDOFF.md` before the next attempt.

Runtime note:
- `delegated-terminal` has a concrete shell loop (`agent-loop.sh`) and is the preferred mode when the run should keep going without conversational re-entry.
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
  executionCommand: ".claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionAdapterCommand: ".claude/scripts/moonshot-phase-dispatch.sh docs/implementation/ --execution-mode in-session-coordinator --execution-root docs/implementation/execution --runtime auto"
  executionCoordinatorSkill: "moonshot-in-session-coordinator"
  coordinatorPolicy: "fresh-fork-per-attempt"
  autoStartExecution: true
  prepareOnly: false
  pendingPhases: 5
```

Mode meanings:
- `delegated-terminal`: this skill prepares state and outputs a command-layer adapter invocation
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

## References

- `/moonshot-orchestrator`: Phase implementation delegation
- `/moonshot-plan-writer`: Fallback plan creation when no safe plan dir exists
- `/moonshot-detect-uncertainty`: Pre-execution uncertainty detection
- `.claude/scripts/moonshot-phase-dispatch.sh`: command-layer dispatcher for both execution modes
- `.claude/scripts/agent-loop.sh`: autonomous execution loop behind `delegated-terminal`
- `/moonshot-in-session-coordinator`: Fresh-attempt coordinator for `in-session-coordinator`

## Orchestrator Integration Contract

When called by `/moonshot-orchestrator`:
1. Resolve `<plan-dir>` first; if no safe plan exists, run `/moonshot-plan-writer` for `docs/implementation`.
2. Prepare plan state and write `.claude/docs/phase-status.yaml`.
3. Seed execution-bridge artifacts for each phase when missing.
4. Return `phaseRunnerResult` summary with `executionMode`, `executionRoot`, and artifact paths (do not inline full phase docs).
5. Do not mark implementation complete here.
6. If `prepareOnly != true`, execute `phaseRunnerResult.executionSkill` immediately and pass `phaseRunnerResult` as input.
7. If `prepareOnly == true`, stop after returning the prepared execution metadata.
8. If `executionMode == in-session-coordinator`, orchestrator must keep the main session thin and run each implementation round as a fresh fork/sub-agent attempt.
9. Completion verification resumes only after the active attempt updates `phase-status.yaml` and execution artifacts.
10. Within each phase, preserve `ready/isolate -> execute -> review -> verify -> finish/handoff` as the default stage order.
