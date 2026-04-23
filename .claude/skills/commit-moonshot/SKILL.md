---
name: commit-moonshot
description: Update project memory and commit when the user explicitly wants both.
triggers:
  - "commit-moonshot"
  - "moonshot commit"
  - "memory commit"
---

# Project Memory Update & Commit

Supported public utility entrypoint. Use only when the user explicitly wants memory refresh plus commit.

## Purpose

- refresh project memory before commit
- keep the memory summary short
- ask only whether `.claude/memory.json` should be included
- create a Korean commit title and grouped bullet body

## Required flow

1. inspect staged changes with compact git commands
2. derive `PROJECT_ID`
3. refresh `[PROJECT_ID]::*` memory entities and relations
4. summarize created or updated memory facts in a short bullet list
5. ask whether `.claude/memory.json` should be staged
6. stage docs and code
7. create the commit in Korean

## Hard rules

- always refresh memory before commit
- never auto-stage `.claude/memory.json` without explicit confirmation
- keep the user-facing summary and commit body grouped by feature area
- keep the summary compact; avoid long prose dumps

## References

- [Commit Moonshot Reference](/Users/dev/claude-settings/.claude/docs/reference/commit-moonshot-reference.md)
- [Token Optimization Guidelines](/Users/dev/claude-settings/.claude/docs/guidelines/token-optimization.md)

---

User context: $ARGUMENTS
