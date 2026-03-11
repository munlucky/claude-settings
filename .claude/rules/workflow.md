# How to Execute Work

- Prefer real actions (reading/editing files, running verification) whenever possible.
- Use `/moonshot-orchestrator` by default for code work; bypass only for read-only tasks, explicit direct-skill use, or self-host workflow edits.
- Keep workflow policy in orchestrator skills; adapters only route.
- Resolve `workflowProfile` and `executionPlane` (`read_only|product_project|meta_harness`) before chain selection.
- `product_project` must pass project-contract, context-readiness, and verification-contract gates before implementation.
- Confirm IN/OUT scope for implementation and refactoring. See `.claude/rules/scope-confirmation.md`.
- If information is missing, ask questions or proceed with explicitly stated low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.
