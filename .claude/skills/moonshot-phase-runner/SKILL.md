---
name: moonshot-phase-runner
description: Master plan based phase-by-phase implementation automation
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
---

# Phase Workflow Runner

## Role

Automates phase-by-phase implementation workflow based on a master plan (`docs/implementation/00-master-plan.md`).
Each phase is executed via `/moonshot-orchestrator` skill, with `/clear` recommended between phases for context isolation.

## Input Parsing

| Argument | Description |
|----------|-------------|
| `next` | Execute next incomplete phase |
| `all` | Execute all incomplete phases sequentially |
| `status` | Output current status only |
| `N` (number) | Execute specific phase (e.g., `4`) |
| `--dry-run` | Output plan without execution |
| `--skip-commit` | Skip commit step |

## Workflow

### 1. Status Check

#### 1.1 Parse Master Plan

Read `docs/implementation/00-master-plan.md` and parse checklist status.

**Parsing rules:**
```
### Phase N: {title} ✅     → status: completed
### Phase N: {title}        → check checklist below
- [x] N.N item              → completed item
- [ ] N.N item              → incomplete item
```

**Phase status determination:**
- All items `[x]` → `completed`
- Some `[x]` → `in_progress`
- All `[ ]` → `pending`

#### 1.2 Phase Document Mapping

Extract document paths for each phase from master plan:
```yaml
phaseDocuments:
  1: "docs/implementation/01-*.md"
  2: "docs/implementation/02-*.md"
  # ... auto-detect via pattern matching
```

#### 1.3 Status File Management

**File location:** `.claude/docs/phase-status.yaml`

Auto-generated on first run:
```yaml
schemaVersion: "1.0"
masterPlan: "docs/implementation/00-master-plan.md"
lastUpdated: "{timestamp}"
phases:
  - number: 1
    title: "{extracted from master plan}"
    document: "docs/implementation/01-*.md"
    status: pending  # pending | in_progress | completed | failed
    completedAt: null
    commitHash: null
    notes: []
currentPhase: null
totalPhases: 9
executionLog: []
```

### 2. User Confirmation

Output status table before execution:

```markdown
## Phase Workflow Runner

**Master Plan:** docs/implementation/00-master-plan.md

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Project Structure & Tauri Setup | ✅ Done |
| 2 | Core UI Layout | ✅ Done |
| 3 | File & Git Integration | ⏳ In Progress |
| 4 | AI Skill System | ⬜ Pending |
...

**Next target:** Phase 3 - File & Git Integration

Continue? (Y/n)
```

Stop here if `--dry-run` option.

### 3. Phase Implementation

#### 3.1 Load Phase Document

Read the full phase document.

#### 3.2 Call Orchestrator

Invoke `/moonshot-orchestrator` skill to delegate phase implementation:

```markdown
**Phase {N} Implementation Request**

Please implement all tasks in the following phase document:

---
{full phase document content}
---

**Completion criteria:**
- All checklist items implemented
- Build successful
- Basic functionality verified
```

#### 3.3 Verify Results

After orchestrator execution:
- Check build status (`npm run build` or project-specific build command)
- Verify basic tests pass
- On failure: `build-error-resolver` auto-injected (handled internally by orchestrator)

### 4. Commit & Status Update

#### 4.1 Execute Commit

Call `/commit-moonshot` skill unless `--skip-commit` option:

```bash
/commit-moonshot "Phase {N}: {phase title} implementation complete"
```

#### 4.2 Update Status File

Update `.claude/docs/phase-status.yaml`:
```yaml
phases:
  - number: {N}
    status: completed
    completedAt: "{ISO timestamp}"
    commitHash: "{git commit hash}"
executionLog:
  - timestamp: "{ISO timestamp}"
    phase: {N}
    action: "completed"
    commitHash: "{hash}"
```

#### 4.3 Sync Master Plan

**Required:** Maintain consistency between status file and master plan

1. Change all checklist items for the phase to `[x]`
2. Add `✅` mark to phase title (if not present)
3. Save file

### 5. Next Phase (Loop)

#### `next` mode
- Output result summary after current phase completion
- Exit

#### `all` mode
1. Check next pending/in_progress phase
2. If none, output completion message and exit
3. If exists, **confirm with user whether to `/clear` and continue**:

```markdown
## Phase {N} Complete!

**Next phase:** Phase {N+1} - {title}

> [!TIP]
> For context optimization, running `/clear` then `/moonshot-phase-runner next` is recommended.

Continue?
- `Y`: Continue in current context
- `clear`: Auto-restart after `/clear`
- `n`: Stop
```

**Full completion output:**
```markdown
## 🎉 Full Workflow Complete!

| Item | Value |
|------|-------|
| Phases executed | 4 |
| Total commits | 4 |
| Time elapsed | ~2 hours |

All phases completed successfully!
```

## Error Handling

### Build/Test Failure

```yaml
buildFailed:
  action:
    - Orchestrator internal build-error-resolver auto-runs
    - Max 2 retries
  fallback:
    - Record failure log to phase-status.yaml
    - Set status to "failed"
    - Report to user and stop
```

### Commit Conflict

```yaml
commitConflict:
  action:
    - Check git status
    - Output conflict file list
    - Request manual resolution from user
  note: Phase implementation recorded as complete (commit pending)
```

### Missing Phase Document

```yaml
documentMissing:
  action:
    - Output warning
    - Request document path confirmation from user
    - Offer skip option for the phase
```

## Usage Examples

```bash
# Check current status
/moonshot-phase-runner status

# Execute next incomplete phase
/moonshot-phase-runner next

# Execute specific phase
/moonshot-phase-runner 4

# Execute all incomplete phases
/moonshot-phase-runner all

# Dry run (check plan only)
/moonshot-phase-runner next --dry-run

# Execute without commit
/moonshot-phase-runner next --skip-commit
```

## References

- `/moonshot-orchestrator`: Phase implementation delegation
- `/commit-moonshot`: Project memory + git commit automation
- `.claude/docs/guidelines/document-memory-policy.md`: Document token management policy
