# How to Execute Work

- Prefer actions over discussion.
- Pick entrypoint by request shape: `product-orchestrator` for idea-to-plan work, `moonshot-phase-runner` for large/phase work, `moonshot-orchestrator` for bounded implementation.
- Keep policy in orchestrators; adapters only route.
- Resolve `workflowProfile` and `executionPlane` before chain selection.
- `product_project` must pass project, context, and verification gates before implementation.
- Medium/complex work follows `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`.
- Review is required before completion claims.
- `meta_harness` edits use `strict` plus fresh verification evidence.
- In strict runs, pass `workspace-isolation-gate` before implementation and `verification-evidence-gate` before completion claims.
- Medium/complex or phase work must keep `SPRINT_CONTRACT`, `QA_REPORT`, and `HANDOFF`; keep policy anchors and verification commands in `SPRINT_CONTRACT`.
- Finish/handoff is required for meaningful implementation work.
- Confirm IN/OUT scope for implementation and refactoring. See `.claude/rules/scope-confirmation.md`.
- If info is missing, ask or proceed with explicit low-risk assumptions.
