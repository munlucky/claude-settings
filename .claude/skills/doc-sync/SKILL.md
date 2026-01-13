---
name: doc-sync
description: Synchronizes documentation across agents to reflect planning changes and status updates.
---

# Doc Sync Skill

> **Purpose**: Automate document sync across agents so plan changes, progress, and open questions update in real time
> **When to use**: After Codex Validator completes, after Requirements Completion Check, before Documentation Finalize
> **Outputs**: `{tasksRoot}/{feature-name}/context.md`, `pending-questions.md`, `flow-report.md`

---

## Goals

### Problems
- **Previous system**: docs updated only by Documentation Agent
- **No mid-step sync**: Validator plan edits not reflected immediately
- **Delayed feedback loop**: Implementation Agent references stale context.md

### Solution
- Update context.md immediately after Codex Validator
- Track real-time progress (flow-report.md)
- Centralize open questions (pending-questions.md)

---

## Auto-trigger points

### 1. After Codex Validator completes
- Apply Validator auto_apply items to context.md
- Add new recommendations to pending-questions.md
- Mark "Planning complete" in flow-report.md

### 2. After Requirements Completion Check
- Add incomplete items to pending-questions.md
- Record "Implementation re-run" in flow-report.md

### 3. Before Documentation Finalize
- Final sync (ensure all docs are current)
- Clear pending-questions.md or mark as Resolved
- Mark flow-report.md as complete

---

## Input format

### YAML (recommended)

```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: Phase 1
    action: append
    content: "Strengthen date input validation: limit to past 30 days"
  - file: pending-questions.md
    action: add_question
    priority: MEDIUM
    content: "Should error messages use Toast?"
    context: "Improve user experience"
  - file: flow-report.md
    action: update_phase
    phase: Planning
    status: completed
```

### Manual trigger (user direct)

```
doc-sync start: batch-management
  - context.md: update Phase 1
  - pending-questions.md: add 1 item
  - flow-report.md: Planning complete
```

---

## Supported files and actions

### 1. context.md

#### Action: `append` (add to end of section)
```yaml
file: context.md
section: Phase 1
action: append
content: "Strengthen date input validation: limit to past 30 days"
```

**Result**:
```markdown
## Phase 1: Mock-based UI (1h)
1. Type definitions (15m)
2. Mock data (10m)
...

### Validator Feedback (added 2025-12-20)
- Strengthen date input validation: limit to past 30 days
```

#### Action: `update` (edit specific content)
```yaml
file: context.md
section: "Risks and Alternatives"
action: update
old_content: "Probability: Medium"
new_content: "Probability: Low (API spec confirmed)"
```

#### Action: `prepend` (add to beginning of section)
```yaml
file: context.md
section: "Target Files"
action: prepend
content: "WARN Validator recommendations applied (2025-12-20)"
```

---

### 2. pending-questions.md

#### Action: `add_question` (add a question)
```yaml
file: pending-questions.md
action: add_question
priority: HIGH
content: "What is the allowed range for past dates?"
context: "Validator feedback: recommend limiting to past 30 days"
options:
  - 30 days
  - 60 days
  - 90 days
  - unlimited
```

**Result**:
```markdown
## Pending Questions

### [HIGH] What is the allowed range for past dates?
- **Found at**: 2025-12-20 09:25
- **Context**: Validator feedback: recommend limiting to past 30 days
- **Options**:
  - 30 days
  - 60 days
  - 90 days
  - unlimited
- **Status**: pending
```

#### Action: `resolve_question` (resolve a question)
```yaml
file: pending-questions.md
action: resolve_question
question_id: 1
resolution: "Decided on 30 days"
resolved_at: "2025-12-20 09:30"
```

**Result**:
```markdown
### [HIGH] ~~What is the allowed range for past dates?~~ (resolved)
- **Decision**: 30 days
- **Resolved at**: 2025-12-20 09:30
```

#### Action: `clear` (remove all questions, for Finalize)
```yaml
file: pending-questions.md
action: clear
archive: true
```

---

### 3. flow-report.md

#### Action: `update_phase` (update phase status)
```yaml
file: flow-report.md
action: update_phase
phase: Planning
status: completed
timestamp: "2025-12-20 09:25"
```

**Result**:
```markdown
| Phase | Status | Start | End |
|-------|--------|-------|-----|
| Planning | OK complete | 09:00 | 09:25 |
| Implementation | In progress | 09:30 | - |
```

#### Action: `add_event` (add event)
```yaml
file: flow-report.md
action: add_event
event: "Validator feedback applied"
description: "Added date validation to context.md"
timestamp: "2025-12-20 09:25"
```

**Result**:
```markdown
## Key Events

- [09:25] **Validator feedback applied**: added date validation to context.md
```

---

## Output format

### Success
```markdown
OK Doc Sync complete

## Updated files
- context.md: added Validator feedback to Phase 1
- pending-questions.md: added 1 question (HIGH)
- flow-report.md: marked Planning complete

## Change summary
- Validator feedback: strengthen date validation (past 30 days)
- New question: decide past date range
- Planning phase complete (elapsed: 25m)

## Next steps
- Implementation Agent re-check (use latest context.md)
- Await pending-questions answers (HIGH 1 item)
```

### Error
```markdown
ERROR Doc Sync failed

## Error details
- context.md: section "Phase 1" not found
- pending-questions.md: update succeeded
- flow-report.md: file not found (needs creation)

## Action required
- Check context.md section structure
- Create flow-report.md manually

## Partial success
1/3 files updated
```

---

## Related agents/skills

### Inputs (consumed)
- **Codex Validator**: auto_apply, user_confirm items
- **Moonshot Agent (Completion Check)**: incomplete_items list
- **Documentation Agent**: final sync request

### Outputs (provided)
- **Implementation Agent**: latest context.md
- **Moonshot Agent**: pending-questions count, flow-report status
- **Documentation Agent**: confirmation that docs are up to date

---

## File structure

### Document paths
```
{tasksRoot}/{feature-name}/
|-- context.md              # implementation plan (real-time updates)
|-- pending-questions.md    # open questions (real-time updates)
`-- flow-report.md          # per-phase progress (real-time updates)
```

### Archive (optional)
```
{tasksRoot}/{feature-name}/archives/
|-- context-v1.md              # before Validator feedback
|-- context-v2.md              # after Validator feedback
`-- pending-questions-resolved.md  # resolved questions
```

---

## Usage scenarios

### Scenario 1: Apply Codex Validator feedback automatically

**Validator output**:
```yaml
status: pass_with_changes
auto_apply:
  - priority: HIGH
    target: context.md
    section: Phase 1
    content: "Strengthen date input validation: limit to past 30 days"
user_confirm:
  - priority: MEDIUM
    content: "Recommend changing error messages to Toast"
```

**Doc Sync run**:
```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: Phase 1
    action: append
    content: "### Validator Feedback (HIGH)
- Strengthen date input validation: limit to past 30 days"
  - file: pending-questions.md
    action: add_question
    priority: MEDIUM
    content: "Should we change error messages to Toast?"
    context: "Validator recommendation"
  - file: flow-report.md
    action: add_event
    event: "Validator feedback applied"
    description: "context.md updated + 1 pending question added"
```

**Result**:
- Implementation Agent reads latest context.md and applies date validation
- User answers pending-questions about Toast

---

### Scenario 2: Re-run after Requirements Completion Check

**Moonshot Agent Completion Check result**:
```yaml
status: incomplete
incomplete_items:
  - "Add error alert"
  - "Configure menu/permissions"
```

**Doc Sync run**:
```yaml
feature_name: batch-management
updates:
  - file: pending-questions.md
    action: add_question
    priority: HIGH
    content: "Implement error alert handling"
    context: "Completion Check: missing in preliminary agreement"
  - file: pending-questions.md
    action: add_question
    priority: HIGH
    content: "Configure menu/permissions"
    context: "context.md Phase 3 checkpoint incomplete"
  - file: flow-report.md
    action: update_phase
    phase: Implementation
    status: "re-run required"
```

**Result**:
- Re-run Implementation Agent (only incomplete items)
- flow-report.md records the re-run

---

### Scenario 3: Final sync before Documentation Finalize

**Documentation Agent request**:
```yaml
feature_name: batch-management
updates:
  - file: context.md
    section: "Final State"
    action: append
    content: "- [x] All phases complete
- [x] Verification passed
- [x] Documentation complete"
  - file: pending-questions.md
    action: clear
    archive: true
  - file: flow-report.md
    action: update_phase
    phase: Documentation
    status: completed
```

**Result**:
- pending-questions.md cleared (resolved items moved to archives)
- flow-report.md marked complete
- context.md updated with final state

---

## Tips

### 1. Avoid conflicts
- Detect simultaneous updates by comparing timestamps
- Notify user and resolve manually on conflict

### 2. Versioning (optional)
- Backup prior versions for important changes
- Store as context-v1.md, context-v2.md

### 3. Rollback support
- Save snapshot before last change
- Restore immediately on failure

### 4. Verification automation
- Validate file structure after updates
- Check required sections are present

---

## Expected impact

### Qualitative impact
1. **Real-time feedback loop**: Validator -> Doc Sync -> Implementation (immediate reflection)
2. **Document consistency**: all agents reference the latest docs
3. **Centralized open questions**: pending-questions.md as the source of truth
4. **Progress transparency**: real-time tracking via flow-report.md

### Quantitative impact
- **Feedback turnaround**: manual 10m -> instant (100% reduction)
- **Doc mismatch errors**: 30% -> 0% (eliminated)
- **Rework prevention**: instant feedback saves ~15m on average

---

## Implementation details

### Quality bar
- Preserve existing content (do not change section structure)
- Prevent conflicts (detect concurrent updates)
- Ensure atomicity (rollback on partial failure)
- Automate validation (check structure after updates)

### Error handling
1. **Missing file**: auto-create (use template)
2. **Missing section**: warn and append to end
3. **Concurrent update conflict**: compare timestamps and notify user
4. **Format error**: validation fails -> rollback

### Logging
- Record all updates in flow-report.md automatically
- Include timestamp, changed files, change details
- Store detailed logs on failure

---

**Enabling this skill keeps all docs in real-time sync.**
