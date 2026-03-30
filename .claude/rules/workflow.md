# How to Execute Work

- Prefer action over discussion.
- Resolve `workflowProfile` and `executionPlane` first.
- `product_project` must pass project/context/verification gates before implementation.
- Human approval is planning-closeout only; after execution starts, loops stay autonomous unless blocked or user-paused.
- Default flow: `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`.
- Review before completion. `meta_harness` uses `strict`; strict runs pass `workspace-isolation-gate` before implementation and `verification-evidence-gate` before completion.
- Medium/complex or phase work must keep `SPRINT_CONTRACT`, `QA_REPORT`, and `HANDOFF`.
- Checkpoints, partial success, setup completion, milestones, refreshes, and progress reports never justify stopping or completion.
- Continue until done criteria are met, or if none exist, while in-scope work remains and no real stop condition exists.
- Stop only for a true blocker, a required user decision, destructive-risk confirmation, or an explicit user pause/redirect.
- Before any non-clean stop, take the next independent low-risk step.
- Non-clean stops must record in `QA_REPORT.md` and `HANDOFF.md`: stop reason, attempts, why autonomy failed, and next step after unblocking.
- Confirm IN/OUT scope. See `.claude/rules/scope-confirmation.md`.
- If info is missing, ask or use low-risk assumptions.
