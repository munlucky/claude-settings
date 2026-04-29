# Session Patterns

Use this reference when recreating the harness maintenance flow from the April 2026 session.

## Patterns Captured

- Prefer existing stage owners over adding thin skills.
- Link external-skill adoption policy from `moonshot-orchestrator` so bounded direct work inherits it.
- Analyze compact `Claude.md` or system-prompt images as pattern sources, not as files to copy.
- Put concrete execution improvements in the owner skills that already run the stage:
  - `task-slicer`
  - `plan-eng-review`
  - `test-driven-development`
  - `qa-flow`
  - `codex-review-code`
  - `code-simplifier`
  - `project-md-refresh`
  - `failure-analyzer`
- Keep runtime parity gate logic strict; update fixtures to match the current contract.
- Downstream `.claude` sync should update shared harness assets while preserving project-local files.
- Transfer useful workflow-prompt patterns as:
  - sideways replan guard in `moonshot-orchestrator`
  - correction lesson classification in `failure-analyzer`, with `session-logger` only for handoff/session logs or solution promotion
  - balanced elegance check in `code-simplifier`
  - autonomous bug-fix posture through existing retry and verification loops

## Common Downstream Preserve List

- `.claude/PROJECT.md`
- `.claude/PROJECT.ko.md`
- `.claude/memory.json`
- `.claude/memorygraph/`
- `.claude/settings.local.json`
- `.claude/.mcp.json`
- `.claude/logs/`
- `.claude/browser-runtime/`
- `.claude/tmp/`
- `.claude/docs/tasks/`
- `.claude/docs/analysis/`
- `.claude/docs/plans/`
- `.claude/docs/code-review/`
- `.claude/knowledge-repo-audit-*`
- `.claude/verification-results-*`
- `.claude/verification-verdict-*`

## Commit Policy Captured

When using `commit-moonshot`, refresh project memory when policy asks for it, but exclude `.claude/memory.json` and `.claude/memorygraph/` from commits by default. Stage memory artifacts only when the user explicitly asks to include memory.
