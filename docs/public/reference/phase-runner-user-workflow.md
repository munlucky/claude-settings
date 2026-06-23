# Phase Runner User Workflow

Moonshot Relay phase work uses two separate document roots:

- Phase plans live under `docs/implementation/<plan-slug>/`.
- User task notes live under `.moonshot-relay/docs/tasks/`.

Before execution, prepare an explicit runner state from the plan package:

```bash
node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir docs/implementation/<plan-slug> --master-plan docs/implementation/<plan-slug>/00-master-plan-v1.md --status-file .moonshot-relay/docs/phase-status.yaml --execution-root docs/implementation/<plan-slug>/execution
```

Do not rely on implicit plan resolution when multiple `docs/implementation/*/00-master-plan-v*.md` packages exist. Pass `--plan-dir` and `--master-plan` so the runner cannot pick stale plans.

General start wording such as "작업시작", "start work", "run this plan", or a plan directory plus master plan means full-plan execution. The runner must not stop after Phase 01 or a preparation/waiver phase unless the operator explicitly asks for a single phase, such as "Phase 01만" or "only phase 01".

For architecture-derived phase plans, the plan package should carry selected `ADR/*.md`, `TRACEABILITY_MATRIX.md` rows, owners, verification signals, and `ARCHITECTURE_REVIEW.md` paths in phase metadata. The runner should pass only the active phase slice to attempt/review agents.

`phase-status.yaml` is a human-readable projection for the active plan loop. It is useful for selecting the next phase, but it is not authority for blocker, resume, or completion decisions when `runtime-state.sqlite` is available.

When a phase has phase-local closeout evidence, the next runner preparation should reconcile that evidence and select the next incomplete phase as active. A phase-local pass is a cursor advance, not a whole-plan success claim.

## Closeout Boundaries

Phase closeout records phase-local evidence. A phase can pass, fail, or carry findings forward based on scorecard, QA, review, and verifier evidence, but a phase-local pass is not whole-plan completion.

Whole-plan closeout is the final authority boundary. After the last actionable phase, run `scripts/runtime-state.mjs assess-completion --json` and require an accepted DB decision before claiming clean completion.

Completion evidence should include:

- a closeout JSON matching `schemas/plan-closeout.schema.json`;
- fresh verification command output or verdict JSON;
- commit status when commit closeout is requested;
- account-root install sync status when shared runtime files changed.

Controlled adoption evidence should be source-first: `node package/build-package.mjs --runtime all --dry-run --json` and `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json` must pass before any live profile or account-root mutation.

## Operational Adoption Closeout

Harness/package/profile changes use the same closeout every time. Before live account-root adoption, collect two independent audits: an independent completion audit and an independent operational adoption audit. Then run:

- `node scripts/doctor.mjs check --json`
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`
- `npm run test:lab`
- `npm run test:package`
- `npm run test:eval`
- `npm test`
- `node package/build-package.mjs --runtime all --dry-run --json`

Only after those pass may a live sync run `node bin/moonshot-relay.mjs install --runtime all --json`. The installer JSON must include `installId`, `verification[]` with no missing or mismatch entries, and `profileSurfaceParity[]`; Codex managed canonical pruning must report `profileSurfaceParity[runtime=codex].extraCanonicalCount=0`.

After the install, run the installed doctor against the installed common payload, not the source checkout:

```powershell
node "$env:MOONSHOT_RELAY_HOME\scripts\doctor.mjs" check --repo-root "$env:MOONSHOT_RELAY_HOME" --lock "$env:MOONSHOT_RELAY_HOME\skills.lock.json" --runtime-surface "$env:MOONSHOT_RELAY_HOME\package\runtime-surface.json" --json
```

Close repository state with `commit-moonshot` when commit/push was requested. A pushed closeout must verify `HEAD == origin/<branch>`.
