# Session Compaction

Keep resumable state small.

## Required Active State

- latest `HANDOFF.md`
- latest `QA_REPORT.md`
- latest `SCORECARD.md`
- one session index entry

## Archive Rules

- Move verbose timelines into daily or archived session logs.
- Keep only summary bullets in active handoff files.
- Prefer artifact references over pasted output.

## Session Index Contract

Use [`SESSION_INDEX.md`](/Users/dev/claude-settings/.claude/templates/session/SESSION_INDEX.md) to track:

- latest active task
- latest decision summary
- latest unresolved issue
- latest artifact links
