# How to Execute Work

- Prefer actions over discussion.
- Use `/moonshot-orchestrator` for code work unless the task is read-only, direct-skill, or self-host.
- Keep workflow policy in orchestrator skills; adapters only route.
- Resolve `workflowProfile` and `executionPlane` (`read_only|product_project|meta_harness`) before chain selection.
- `product_project` must pass project, context, and verification gates before implementation.
- Medium/complex product work: create `SPRINT_CONTRACT`, use separate completion verification, and keep `QA_REPORT`/`HANDOFF` for multi-round work.
- Confirm IN/OUT scope for implementation and refactoring. See `.claude/rules/scope-confirmation.md`.
- If information is missing, ask or proceed with explicit low-risk assumptions.
- Complex work follows plan -> implement -> verify -> summarize.
