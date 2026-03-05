---
paths:
  - ".claude/agents/**/*.md"
  - ".claude/skills/**/*.md"
---

# Agent Delegation Rules

## Delegate When Needed

- Complex feature/refactor -> `moonshot-orchestrator` first.
- Unclear requirements -> `requirements-analyzer`.
- Build/test failures -> `build-error-resolver` or `completion-verifier`.
- Security concerns -> `security-reviewer`.
- Documentation alignment -> `documentation-agent`.

## Do Not Delegate

- Simple read-only Q&A.
- Small direct edits with clear scope.

## Delegation Quality Bar

- Pass clear scope, expected output, and constraints.
- Pass minimal context (paths/summaries, not full history).
- Verify delegate output before finalizing.
