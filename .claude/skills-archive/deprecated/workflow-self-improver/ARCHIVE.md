# Archived Skill: workflow-self-improver

Archived: 2026-04-24

## Reason

`workflow-self-improver` is no longer part of the public workflow surface or default Moonshot stage model. Its reflection behavior is now handled through explicit failure analysis, scorecard status, and documented change packages.

## Replacement Path

- Use `failure-analyzer` for root-cause and retry-loop evidence.
- Use `docs/claude-tasks/skill-architecture-rework/` for workflow architecture changes.
- Use `session-logger` for handoff and session continuity notes.

## Restore Procedure

Move this directory back to `.claude/skills/workflow-self-improver` only after assigning a non-deprecated `surfaceStatus` and documenting a concrete gate, bundle, or maintenance workflow that consumes it.
