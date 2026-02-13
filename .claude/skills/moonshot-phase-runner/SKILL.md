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
    ├─ 3. Plan Review (unless --autonomous)
    │      └─ Detect uncertainties → Q&A → planConfirmed: true
    │
    ├─ 4. Output Execution Command
           └─ User copies and runs in separate terminal
    
    └─ 5. Emit Handoff Summary
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
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: false
  - number: 2
    title: "Core Implementation"
    status: pending
    planConfirmed: false
```

## Step 3: Plan Review (Optional)

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

## Step 4: Output Execution Command

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

  .claude/scripts/agent-loop.sh docs/implementation/

───────────────────────────────────────────────────────────────

💡 Tip: Logs available at .claude/logs/agent-loop/
```

## Step 5: Emit Handoff Summary

Return a structured summary for orchestrator:

```yaml
phaseRunnerResult:
  prepared: true
  executionMode: delegated-terminal
  planDir: "docs/implementation/"
  masterPlan: "docs/implementation/00-master-plan.md"
  phaseStatusFile: ".claude/docs/phase-status.yaml"
  executionCommand: ".claude/scripts/agent-loop.sh docs/implementation/"
  pendingPhases: 5
```

`executionMode: delegated-terminal` means this skill does not execute phase work directly.

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
autonomousMode: true
preparedAt: "2026-02-08T15:00:00Z"
phases:
  - number: 1
    title: "Project Setup"
    status: pending
    planConfirmed: true
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
2. Return `phaseRunnerResult` summary (do not inline full phase docs).
3. Do not mark implementation complete here.
4. Orchestrator resumes completion verification only after external phase execution updates `phase-status.yaml`.
