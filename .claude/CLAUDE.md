# Global Development Guidelines

> This is the global rules document. For project-specific rules see `.claude/PROJECT.md`, and for agent canonical format see `.claude/AGENT.md`.

## Overview

This document uses modular rules stored in `.claude/rules/`. All rules are automatically loaded.

## Core Rules

> Rules in `.claude/rules/` are auto-loaded. See that folder for all active rules.

## Document Memory Policy

> **Critical**: Follow `.claude/docs/guidelines/document-memory-policy.md` to prevent 64k token limit errors.

**Default document paths** (override in PROJECT.md if needed):
```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"       # DEFAULT (often gitignored)
  # tasksRoot: "docs/claude-tasks"      # Use this for git-tracked projects
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

**Token limits (must enforce):**
| Document | Max Tokens | Action on Exceed |
|----------|-----------|------------------|
| context.md | 8,000 | Archive previous version |
| specification.md | 2,000 | Summarize, move full to archives/ |
| Review outputs | 4,000 | Store full in archives/, summary only in context.md |

**Triggers:**
- Spec > 2,000 words → Summarize + archive original
- Independent features > 5 → Split into subtasks
- Plan/review loop → Replace sections, don't append

## Quality/Verification
## References

- Project-specific rules: @.claude/PROJECT.md
- Agent format: @.claude/AGENT.md
