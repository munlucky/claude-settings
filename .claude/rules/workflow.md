# How to Execute Work

- Prefer real actions (reading/editing files, running verification) whenever possible.
- **Automatic task analysis**: If the user request is code work (feature add/change, bug fix, refactor, etc.), immediately run the `/moonshot-orchestrator` skill.
  - Exclude simple questions, info lookups, or read/describe-only tasks.
  - Workflow details: `.claude/skills/moonshot-orchestrator/SKILL.md`
- **Cross-runtime policy source**: keep policy in `skills`/orchestrator; `commands`/hooks/scripts are adapters only.
- **Workflow profile**: track `workflowProfile` (`standard|strict`); strict disallows warning-only completion.
- **Scope confirmation**: For implementation/refactoring tasks, confirm IN/OUT scope boundaries before starting. See `.claude/rules/scope-confirmation.md`.
- **Skill priority**: When a custom skill or orchestrator workflow exists for a task type, use it immediately rather than starting with exploratory file reading.
- If information is missing, ask questions or proceed with explicitly stated low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.
