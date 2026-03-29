# How to Execute Work

- Prefer actions over discussion.
- Pick entrypoint by request shape: `product-orchestrator` for idea-to-plan, `moonshot-phase-runner` for large/phase, `moonshot-orchestrator` for bounded work.
- Keep policy in orchestrators.
- Resolve `workflowProfile` and `executionPlane` before selection.
- `product_project` must pass project/context/verification gates before implementation.
- Medium/complex flow: `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`.
- Review before completion.
- `meta_harness` edits use `strict` plus fresh evidence.
- In strict runs, pass `workspace-isolation-gate` before implementation and `verification-evidence-gate` before completion.
- Medium/complex or phase work must keep `SPRINT_CONTRACT`, `QA_REPORT`, and `HANDOFF`; keep anchors and verification commands in `SPRINT_CONTRACT`.
- Finish/handoff is required for meaningful work.
- Checkpoints, artifact refreshes, and doc/QA updates never justify stopping.
- If in-scope work remains and there is no blocker, pause, interruption, or deferred verification, continue.
- Any non-clean stop must record an explicit reason in `QA_REPORT.md` and `HANDOFF.md`; `"checkpoint reached"` is invalid.
- Confirm IN/OUT scope. See `.claude/rules/scope-confirmation.md`.
- If info is missing, ask or use low-risk assumptions.
