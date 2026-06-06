# How to Execute Work

- Prefer action.
- Resolve `workflowProfile` / `executionPlane` first.
- `product_project` must pass project/context/verification gates before implementation.
- Human approval ends at planning; execution stays autonomous unless blocked.
- Default flow: `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`.
- Review before completion. Strict runs pass `workspace-isolation-gate` before implementation and `verification-evidence-gate` before closeout.
- No completion wording without fresh evidence; review findings stay open until `QA_REPORT.md` records disposition.
- Tool selection, skipped components, schema loading mode, and approval-required operations must be represented in runtime evidence when the runtime control plane is available.
- Unauthorized approval-required operations are blockers, not warnings.
- Medium/complex or phase work keeps `SPRINT_CONTRACT`, `QA_REPORT`, `HANDOFF`.
- Checkpoints, partial success, setup, milestones, refreshes, and progress reports do not justify stopping.
- Continue until done criteria are met or in-scope work is exhausted without a stop condition.
- Stop only for a true blocker, a required user decision, destructive-risk confirmation, or an explicit user pause/redirect.
- Before any non-clean stop, take the next independent low-risk step.
- Non-clean stops must record in `QA_REPORT.md` and `HANDOFF.md`: reason, attempts, why autonomy failed, and next step.
- Confirm IN/OUT scope. See `rules/scope-confirmation.md` in source checkouts or `.claude/rules/scope-confirmation.md` in installed Claude profiles.
- If info is missing, ask or use low-risk assumptions.
