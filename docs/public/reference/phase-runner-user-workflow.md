# Phase Runner User Workflow

Moonshot Relay phase work uses two separate document roots:

- Phase plans live under `docs/implementation/<plan-slug>/`.
- User task notes live under `.moonshot-relay/docs/tasks/`.

Before execution, prepare an explicit runner state from the plan package:

```bash
node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir docs/implementation/<plan-slug> --master-plan docs/implementation/<plan-slug>/00-master-plan-v1.md --status-file .claude/docs/phase-status.yaml --execution-root docs/implementation/<plan-slug>/execution
```

Do not rely on implicit plan resolution when multiple `docs/implementation/*/00-master-plan-v*.md` packages exist. Pass `--plan-dir` and `--master-plan` so the runner cannot pick stale plans.

Completion evidence should include:

- a closeout JSON matching `schemas/plan-closeout.schema.json`;
- fresh verification command output or verdict JSON;
- commit status when commit closeout is requested;
- account-root install sync status when shared runtime files changed.
