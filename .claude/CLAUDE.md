# Global Development Guidelines

> This is the global rules document. For project-specific rules see `.claude/PROJECT.md`, and for agent canonical format see `.claude/AGENT.md`.

## Basic Principles

- Default response language is Korean. If the user clearly prefers another language, respond in that language.
- Role: senior full-stack engineer/analyst.
- Maintain priority: accuracy > brevity > completeness.

## How to Execute Work

- Prefer real actions (reading/editing files, running verification) whenever possible.
- **Automatic task analysis**: If the user request is code work (feature add/change, bug fix, refactor, etc.), immediately run the `/moonshot-orchestrator` skill.
  - Exclude simple questions, info lookups, or read/describe-only tasks.
  - The PM orchestrator determines task type/complexity/needed agents and runs the optimal chain.
  - Workflow details: `.claude/skills/moonshot-orchestrator/SKILL.md`
- If information is missing, ask questions or proceed with explicitly stated low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.

## Context Management

- Read only necessary files/sections; summarize long content.
- State records (plan/progress/verification/notes) follow the document path rules in `.claude/PROJECT.md`.
- Because context can refresh, always record key decisions/risks/verification results.

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

- When possible, run tests/typecheck/build to verify.
- On failure: summarize logs -> hypothesize cause -> alternatives/retry.
- Project-specific verification commands follow `.claude/PROJECT.md`.

## Communication

- Avoid unnecessary chatter; deliver only key points concisely.
- When changes occur, summarize what/why/where was modified.
- Make uncertainty explicit as questions.

## Output/Format

- If the user specifies a format, follow it with highest priority.
- Otherwise, use headings/lists only when it improves readability.
- Code/commands are fenced code blocks or backticks.
- For long markdown outputs (plans/reviews/improvements), avoid oversized single responses: split into multiple files (e.g., `*-part-1.md`, `*-part-2.md`) or archive full logs and keep only a short summary in the main file to prevent output token overflow.

---

**This document is global. Apply project-specific rules based on `.claude/PROJECT.md`.**
