---
name: moonshot-phase-runner
description: Master plan based phase-by-phase implementation automation with agent loop
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
---

# Phase Workflow Runner

## Role

Automates phase-by-phase implementation based on master plan documents.
Integrates plan review (Q&A) and autonomous execution loop.

## Usage

```bash
# Specify plan directory and run
/moonshot-phase-runner docs/implementation/

# Without argument (will ask for directory)
/moonshot-phase-runner
```

## Workflow

```
/moonshot-phase-runner <plan-dir>
    │
    ├─ 1. Plan Directory Validation
    │      └─ Verify master plan + phase docs exist
    │
    ├─ 2. Plan Review (Q&A)
    │      └─ Each phase: detect uncertainties → ask user → confirm
    │
    └─ 3. Loop Execution
           └─ agent-loop.sh runs each phase as worker session
           └─ Status displayed in real-time
```

## Step 1: Plan Directory

```yaml
input:
  provided: Use provided path
  not_provided: Ask user

validation:
  - Check directory exists
  - Find master plan (00-master-plan.md or *master*.md)
  - Count phase documents

output:
  success: "Found {N} phases in {plan-dir}"
  failure: "Master plan not found"
```

## Step 2: Plan Review

For each phase:

```yaml
actions:
  1. Load phase document
  2. Run /moonshot-detect-uncertainty
  3. If uncertainties found:
     - Display questions to user
     - Wait for answers
     - Update phase document with answers
  4. Mark phase as planConfirmed: true in phase-status.yaml
```

**Output:**
```markdown
## Phase 1 Review

✅ No uncertainties - confirmed

## Phase 2 Review

⚠️ Uncertainties found:
1. API response format: { data: [] } or { items: [] }?

> Waiting for answer...
```

## Step 3: Loop Execution

When all phases are confirmed:

```bash
# Execute agent-loop.sh in foreground
.claude/scripts/agent-loop.sh "$PLAN_DIR"
```

**Real-time output:**
```
═══════════════════════════════════════════════════════════════
  Agent Loop Started
═══════════════════════════════════════════════════════════════

ℹ️ Plan directory: docs/implementation/
ℹ️ Total phases: 5

───────────────────────────────────────────────────────────────
📦 Phase 1: Project Setup
✅ Phase 1 completed (45s)

───────────────────────────────────────────────────────────────
📦 Phase 2: Core UI
✅ Phase 2 completed (120s)

───────────────────────────────────────────────────────────────
📦 Phase 3: File & Git Integration
❌ Phase 3 failed

⚠️ Continue to next phase? (y/n)
```

## Status File

`.claude/docs/phase-status.yaml`:

```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
phases:
  - number: 1
    title: "Project Setup"
    status: completed
    planConfirmed: true
    completedAt: "2026-02-06T14:00:00Z"
  - number: 2
    title: "Core UI"
    status: in_progress
    planConfirmed: true
```

## Error Handling

```yaml
buildFailed:
  action: Display error, ask to continue or stop

phaseDocMissing:
  action: Skip with warning

userCancel:
  action: Stop loop gracefully
```

## References

- `/moonshot-orchestrator`: Phase implementation delegation
- `/moonshot-detect-uncertainty`: Pre-execution uncertainty detection
- `/commit-moonshot`: Project memory + git commit automation
- `.claude/scripts/agent-loop.sh`: Worker session spawner
