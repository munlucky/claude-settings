# Independent Review Loop

Independent plan review is a sidecar input, not a replacement for parent-owned file edits.

## Rules

- Reviewer output stays in `planning-loop/` until the parent accepts specific edits.
- For default account-root plans, `planning-loop/` is under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/`, not the source checkout.
- Parent session writes the final master plan and phase docs.
- Review artifacts must name the plan package root they reviewed.
- A degraded review is allowed only when the reason is recorded in the plan package.
- First-pass review is capped at three perspectives.
- Re-review is limited to one blocker-confirmation pass. Non-blocking findings move to backlog.
- High-risk plans should use at least two independent perspectives when reviewer isolation is available. High-risk means the plan mutates package/runtime payloads, installed profiles, external services, or data/state.
- Per-document review entries are required when the user requests document-level review, when phase docs own different adoption surfaces, or when a phase doc changes execution authority, evidence authority, delivery, deployment, installation, or migration behavior.

## Required Review Artifact

Use `planning-loop/plan-quality-review-iter-<NN>.yaml` or an equivalent markdown note that records:

- reviewed package root
- blocking findings
- accepted changes
- rejected changes and reason
- remaining ambiguity
- reviewed surface classifications and missing policy gates, when applicable

The plan writer must still run the Plan Artifact Closure Gate after applying accepted review edits.
