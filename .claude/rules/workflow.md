# How to Execute Work

- Prefer actions over discussion.
- Use `/moonshot-orchestrator` for code work in Claude Code and Codex; phase runners and shell adapters only route.
- Keep workflow policy in orchestrator skills; adapters only route.
- Resolve `workflowProfile` and `executionPlane` before chain selection.
- `product_project` must pass project, context, and verification gates before implementation.
- Core `meta_harness` edits must use `strict` and fresh verification evidence.
- Medium/complex or phase work must keep `SPRINT_CONTRACT`, `QA_REPORT`, and `HANDOFF`; each round keeps policy anchors and required verification commands in `SPRINT_CONTRACT`.
- Confirm IN/OUT scope for implementation and refactoring. See `.claude/rules/scope-confirmation.md`.
- If information is missing, ask or proceed with explicit low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.
