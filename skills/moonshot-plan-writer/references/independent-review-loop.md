# Independent Review Loop

Independent plan review is a sidecar input, not a replacement for parent-owned file edits.

## Rules

- Reviewer output stays in `planning-loop/` until the parent accepts specific edits.
- Parent session writes the final master plan and phase docs.
- Review artifacts must name the plan package root they reviewed.
- A degraded review is allowed only when the reason is recorded in the plan package.
- First-pass review is capped at three perspectives.
- Re-review is limited to one blocker-confirmation pass. Non-blocking findings move to backlog.

## Required Review Artifact

Use `planning-loop/plan-quality-review-iter-<NN>.yaml` or an equivalent markdown note that records:

- reviewed package root
- blocking findings
- accepted changes
- rejected changes and reason
- remaining ambiguity

The plan writer must still run the Plan Artifact Closure Gate after applying accepted review edits.
