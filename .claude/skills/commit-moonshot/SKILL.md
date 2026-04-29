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
- exclude `.claude/memory.json` and `.claude/memorygraph/` from commits by default after refreshing memory
- create a Korean commit title and grouped bullet body

## Required flow

1. inspect staged changes with compact git commands
2. derive `PROJECT_ID`
3. refresh MemoryGraph memories with `context.project_path`, `context.project_id`, `project:<projectId>`, and `source:moonshot`
4. summarize created or updated memory facts in a short bullet list
5. keep `.claude/memory.json` and `.claude/memorygraph/` unstaged unless the user explicitly asks to include memory
6. stage docs and code only
7. create the commit in Korean

## Hard rules

- always refresh memory before commit
- never auto-stage `.claude/memory.json` or `.claude/memorygraph/` by default
- only stage memory artifacts when the user explicitly asks to include memory in the commit
- if MemoryGraph is unavailable, record the failure and continue the Git closeout when the user explicitly requested commit/push
- warn before committing when product implementation changes are mixed with `.claude/scripts/**`, `.claude/skills/**`, or `.claude/verification.contract.yaml` changes
- require `QA_REPORT.md` to contain a `Harness Change Ledger` entry when harness/tool changes were made during a product phase
- keep the user-facing summary and commit body grouped by feature area
- keep the summary compact; avoid long prose dumps

## References

- [Commit Moonshot Reference](/Users/dev/claude-settings/.claude/docs/reference/commit-moonshot-reference.md)
- [Token Optimization Guidelines](/Users/dev/claude-settings/.claude/docs/guidelines/token-optimization.md)

---

User context: $ARGUMENTS
