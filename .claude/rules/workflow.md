# How to Execute Work

- Prefer actions over discussion.
- Resolve `workflowProfile` and `executionPlane` before selection.
- `product_project` must pass project/context/verification gates before implementation.
- Human approval is planning-closeout only.
- Medium/complex flow: `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`.
- Review before completion.
- `meta_harness` edits use `strict` plus fresh evidence.
- In strict runs, pass `workspace-isolation-gate` before implementation and `verification-evidence-gate` before completion.
- Medium/complex or phase work must keep `SPRINT_CONTRACT`, `QA_REPORT`, and `HANDOFF`.
- Checkpoints, artifact refreshes, and doc/QA updates never justify stopping.
- If in-scope work remains and there is no real stop condition, continue.
- Any non-clean stop must record a real reason in `QA_REPORT.md` and `HANDOFF.md`.
- Confirm IN/OUT scope. See `.claude/rules/scope-confirmation.md`.
- If info is missing, ask or use low-risk assumptions.
- After execution starts, `execute -> review -> verify -> retry` runs autonomously unless blocked or paused by the user.
