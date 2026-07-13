# Phase Runner User Workflow

Moonshot Relay phase work separates durable source docs from project-scoped operational planning:

- Default phase plans live under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/`.
- Repo-local `docs/implementation/<plan-slug>/` is tracked-source mode. Use it only when the operator explicitly wants the plan package committed as source.
- User task notes live under `.moonshot-relay/docs/tasks/`.
- Phase execution scratch defaults to `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/execution/worktrees/<worktreeId>/branches/<branchId>/plans/<plan-slug>/runs/<runId>/execution/`.

Before execution, prepare an explicit runner state from the plan package:

```bash
node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>" --master-plan "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/00-master-plan-v1.md" --status-file .moonshot-relay/docs/phase-status.yaml
```

Do not rely on implicit plan resolution when multiple packages exist. Pass `--plan-dir` and `--master-plan` so the runner cannot pick stale plans. The `<projectId>` must come from `scripts/project-identity.mjs`; do not hand-share a generic account-root planning directory across repositories.

The dry-run JSON reports `planRootKind` so operators can distinguish `account_project_planning`, `tracked_source_design`, and `source_roadmap` packages. For `docs/public/roadmaps/**`, the runner keeps execution scratch under the account-root project execution namespace and emits `executionPackageRecommendation` so durable roadmaps are not mistaken for ordinary implementation packages.

Parallel execution requires explicit graph metadata. Without `plan-graph.json`, `planGraphStatus.status` is `markdown_sequential`; `--allow-parallel` is blocked until a validated graph proves dependencies and non-overlapping write sets.

When the runner is invoked outside this source checkout, `runtimeBridgeStatus` reports whether project-local bridge entries exist: `scripts/runtime-state.mjs`, `scripts/prepare-phase-runner-state.mjs`, `scripts/knowledge-context-build.mjs`, `tools/sandbox/policy.mjs`, `verification.contract.yaml`, and `.moonshot-relay/.gitignore`. Missing entries include exact recovery and dry-run recovery commands.

When tracked-source mode is intentional, first add a slug-specific `.gitignore` exception through the bridge, for example `node scripts/install-project-runtime-bridge.mjs --target . --plan-package docs/implementation/<plan-slug> --json`, or explicitly force-add the reviewed package. The repository ignores new `docs/implementation/**` files by default so normal planning artifacts do not appear in commit workflows.

General start wording such as "작업시작", "start work", "run this plan", or a plan directory plus master plan means full-plan execution. The runner must not stop after Phase 01 or a preparation/waiver phase unless the operator explicitly asks for a single phase, such as "Phase 01만" or "only phase 01".

For architecture-derived phase plans, the plan package should carry selected `ADR/*.md`, `TRACEABILITY_MATRIX.md` rows, owners, verification signals, and `ARCHITECTURE_REVIEW.md` paths in phase metadata. The runner should pass only the active phase slice to attempt/review agents.

`phase-status.yaml` is a human-readable projection for the active plan loop. It is useful for selecting the next phase, but it is not authority for blocker, resume, or completion decisions when `runtime-state.sqlite` is available.

When a phase has phase-local closeout evidence, the next runner preparation should reconcile that evidence and select the next incomplete phase as active. A phase-local pass is a cursor advance, not a whole-plan success claim.

## Session Retrospective Audit

Use `node scripts/phase-runner-session-audit.mjs --sessions-root <dir-or-jsonl> --json` when auditing phase-runner usage from Codex JSONL exports. The analyzer counts direct user invocations, deduplicates sessions by stable session or thread identity, and excludes injected skill metadata, memory summaries, subagent prompts, duplicate rollout files, invalid JSON lines, and tool-only prepare-state evidence. Tests must use synthetic fixtures, not live `.codex/sessions/**` data.

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
node "$env:MOONSHOT_RELAY_HOME\scripts\doctor.mjs" check --repo-root "$env:MOONSHOT_RELAY_HOME" --evidence-root "<preserved-closeout-evidence-root>" --lock "$env:MOONSHOT_RELAY_HOME\skills.lock.json" --runtime-surface "$env:MOONSHOT_RELAY_HOME\package\runtime-surface.json" --json
```

`--evidence-root` is optional and defaults to `--repo-root`. For an installed payload, point it at the preserved source closeout root that contains the real `.moonshot-relay/harness-lab-runs/` tree. This does not relax installed trust: skills, lock, runtime surface, and package boundary checks remain bound to the explicit installed `--repo-root`.

Close repository state with `commit-moonshot` when commit/push was requested. A pushed closeout must verify `HEAD == origin/<branch>`.
