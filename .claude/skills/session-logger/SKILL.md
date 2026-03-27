---
name: session-logger
description: Logs development sessions in real-time to track decisions and issues.
---

# Session Logger Skill

## Visibility

This is a doc-ops helper and a supported public utility entrypoint.
It may run behind the doc-ops bundle or be invoked directly when the user wants explicit session or handoff logging.

> **Purpose**: Record development sessions in real time to track decisions and trial/error
> **When to log**: work start, agent switch, decisions, issues, work completion
> **Output**: Prefer `docs/daily/YYYY-MM-DD/{runtime}.md` when the project uses `docs/daily/README.md`; otherwise fall back to `{tasksRoot}/{feature-name}/session-logs/day-YYYY-MM-DD.md`

---

## Logging Moments (Auto Triggers)

| Trigger | Log Format |
|---------|------------|
| Work start | `## [HH:MM] Work started` + request, branch, initial analysis |
| Agent switch | `## [HH:MM] Agent A -> Agent B` + outputs, next step |
| Decision | `## [HH:MM] Decision: {topic}` + reason, alternatives |
| Issue | `## [HH:MM] Issue: {problem}` + cause, fix, prevention |
| Completion | `## [HH:MM] Work completed` + commits, verification |

---

## Session Log Template

```markdown
# {YYYY-MM-DD} {feature-name} Session

## Metadata
- Start/End: {HH:MM} - {HH:MM}
- Branch: {branch}
- Main work: {summary}

## Timeline
### [HH:MM] Event
- Details...

## Decision Log
| Time | Decision | Reason | Alternative |
|------|----------|--------|-------------|

## Issue Log
### Issue #N: {title}
- Problem / Cause / Fix / Prevention

## Fix Forward Tasks
| Issue | Severity | File | Suggestion | Status |
|-------|----------|------|------------|--------|
| {from codex-review-code fixForward.tasks[]} | HIGH | {file} | {suggestion} | ⏳ Pending |

## Retrospective
- What went well / What to improve / Lessons
```

---

## Session Handoff (HANDOFF.md)

When context window is over 80% full:

1. If `analysisContext.artifacts.handoffPath` exists, use that path; otherwise create `{tasksRoot}/{feature-name}/HANDOFF.md`
2. Run `/clear`
3. Load HANDOFF.md in new session

**HANDOFF.md Template:**
```markdown
# {Task} - Handoff

## Goal
{Current objective}

## Progress
- Done: ...
- Worked: ...
- Failed: ... (reason)

## Fix Forward Tasks (Carry Over)
| Issue | Severity | File | Suggestion |
|-------|----------|------|------------|
| {pending fix-forward tasks from this session} |

## Next Steps
1. Resolve fix-forward tasks above (if any)
2. ...

## Context
- Files: {paths}
- Branch: {branch}
- Last commit: {hash}
```

---

## File Structure

Preferred shared daily log structure:

```
docs/daily/
└── YYYY-MM-DD/
    ├── codex.md
    ├── claude.md
    └── kimi.md
```

Task-local fallback structure:

```
{tasksRoot}/{feature-name}/
├── HANDOFF.md
└── session-logs/
    ├── day-YYYY-MM-DD.md
    └── ...
```

Execution-bridge variant:

```
{tasksRoot}/{feature-name}/execution/{slice-name}/
├── SPRINT_CONTRACT.md
├── QA_REPORT.md
└── HANDOFF.md
```

---

## Tips

1. **Auto-create** at work start
2. **Real-time updates** on each agent switch
3. **Token limit**: Keep daily logs under 5000 tokens
4. **Resume**: Review previous log before continuing

---

## Memory Integration (Optional)

> Only active when MCP Memory is configured.

| Event | Key Pattern | Example |
|-------|-------------|---------|
| Decision | `decision:{feature}:{topic}` | API pattern choice |
| Progress | `progress:{feature}` | Phase 1 complete |
| Solution | `solution:{issue-type}` | snake_case fix |
