---
title: Document Memory Policy
description: Short policy for active document size, archiving, and resumable state.
---

# Document Memory Policy

Use this file as the short policy layer. Detailed examples belong in reference docs, not here.

## Scope

- active task docs under `{tasksRoot}/{feature-name}/`
- execution artifacts such as `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`
- daily or archived session logs

## Hard Limits

| Artifact | Preferred Ceiling | Action |
|----------|-------------------|--------|
| `context.md` | 8,000 tokens | archive previous version |
| `specification.md` | 2,000 tokens | move full spec to archives, keep summary |
| review output | 4,000 tokens | archive raw review, keep summary only |
| daily session log | 5,000 tokens | split or roll to next file |

## Required Structure

- keep one active summary document per task
- archive verbose history under `archives/`
- keep resumable state in:
  - latest `HANDOFF.md`
  - latest `QA_REPORT.md`
  - latest `SCORECARD.md`
  - session index

## Required Behaviors

- prefer summary + artifact link over pasted raw output
- prefer section references over re-reading full large specs
- split complex work into subtasks when one context file becomes noisy
- keep archive indexes current when creating a new archived version

## Skill Expectations

- `session-logger`: keep active log compact, push long timelines to archive
- `codex-review-code`: keep findings summary in active docs, archive raw review
- `commit-moonshot`: summarize memory refresh in bullets, not long prose
- `efficiency-tracker`: deprecated; if explicitly used for historical reporting, keep current report thin and archive prior detail

## References

- [Token Quick Start](/Users/dev/claude-settings/.claude/docs/reference/token-quick-start.md)
- [Token Architecture Map](/Users/dev/claude-settings/.claude/docs/reference/token-architecture-map.md)
- [Session Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [Token Common Mistakes](/Users/dev/claude-settings/.claude/docs/reference/token-common-mistakes.md)
