---
name: moonshot-phase-runner
description: Master plan based phase-by-phase implementation automation
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

> **Note**: Actual execution is done by running `agent-loop.sh` in a separate terminal.

## Usage

```bash
# Specify plan directory
/moonshot-phase-runner docs/implementation/

# Autonomous mode (skip Q&A)
/moonshot-phase-runner docs/implementation/ --autonomous
```

## Workflow

```
/moonshot-phase-runner <plan-dir> [--autonomous]
    │
    ├─ 1. Plan Directory Validation
    │      └─ Verify master plan + phase docs exist
    │
    ├─ 2. Create/Update phase-status.yaml
    │      └─ Initialize each phase status
    │
    ├─ 3. Seed execution bridge artifacts
    │      └─ Prepare `execution/<phase>/SPRINT_CONTRACT.md`
    │         and placeholders for `QA_REPORT.md`, `HANDOFF.md`
    │
    ├─ 4. Plan Review (unless --autonomous)
    │      └─ Detect uncertainties → Q&A → planConfirmed: true
    │
    ├─ 5. Output Execution Command
           └─ User copies and runs in separate terminal
    
    └─ 6. Emit Handoff Summary
           └─ Orchestrator-readable phaseRunnerResult
```

## Step 1: Plan Directory Validation

```yaml
validation:
  - Check directory exists
  - Find master plan (00-master-plan.md or *master*.md)
  - Count phase documents

output:
  success: "✅ Found {N} phases in {plan-dir}"
  failure: "❌ Master plan not found"
```

## Step 2: Create phase-status.yaml

Creates `.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionRoot: "docs/implementation/execution"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
    sprintContract: "docs/implementation/execution/01-project-setup/SPRINT_CONTRACT.md"
    qaReport: "docs/implementation/execution/01-project-setup/QA_REPORT.md"
    handoff: "docs/implementation/execution/01-project-setup/HANDOFF.md"
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

## Step 3: Seed Execution Bridge Artifacts

For each detected phase, prepare:
- `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md`
- `<plan-dir>/execution/<phase>/QA_REPORT.md`
- `<plan-dir>/execution/<phase>/HANDOFF.md`

Rules:
- `SPRINT_CONTRACT.md` is seeded from the phase title and document path
- `QA_REPORT.md` and `HANDOFF.md` start as placeholders and are updated during execution
- do not overwrite an existing artifact that already contains work

## Step 4: Plan Review (Optional)

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

## Step 5: Output Execution Command

**Final output format:**

```
═══════════════════════════════════════════════════════════════
  ✅ Ready
═══════════════════════════════════════════════════════════════

📋 Plan: docs/implementation/00-master-plan.md
📦 Phases: 5
🤖 Mode: Autonomous

───────────────────────────────────────────────────────────────
  Run the following command in a separate terminal:
───────────────────────────────────────────────────────────────

  .claude/scripts/agent-loop.sh docs/implementation/ --execution-root docs/implementation/execution

───────────────────────────────────────────────────────────────

💡 Tip: Logs available at .claude/logs/agent-loop/
```

## Step 6: Emit Handoff Summary

Return a structured summary for orchestrator:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: delegated-terminal
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionRoot: "docs/implementation/execution"
  executionCommand: ".claude/scripts/agent-loop.sh docs/implementation/ --execution-root docs/implementation/execution"
  pendingPhases: 5
```

`executionMode: delegated-terminal` means this skill does not execute phase work directly.

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
executionRoot: "docs/implementation/execution"
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
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
- `/moonshot-detect-uncertainty`: Pre-execution uncertainty detection
- `.claude/scripts/agent-loop.sh`: Autonomous execution loop (run by user separately)

## Orchestrator Integration Contract

When called by `/moonshot-orchestrator`:
1. Prepare plan state and write `.claude/docs/phase-status.yaml`.
2. Seed execution-bridge artifacts for each phase when missing.
3. Return `phaseRunnerResult` summary (do not inline full phase docs).
4. Do not mark implementation complete here.
5. Orchestrator resumes completion verification only after external phase execution updates `phase-status.yaml` and execution artifacts.
