# Phase 08 - Packaging, Account-Root Rollout, and Downstream Adoption v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Materialize the full modernization into package/install surfaces and define controlled account-root/downstream adoption without overwriting project-local state.

## Owned Paths

- `package/build-package.mjs`
- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `bin/moonshot-relay.mjs`
- `docs/public/installer-usage.md`
- `docs/public/runtime-state-cleanup.md`
- `skills/moonshot-relay-maintainer/SKILL.md`
- `tests/package-materialization.test.mjs`
- `tests/workflow-e2e-contract.test.mjs`

## Read-Only / Preserved Paths

- `.claude/memory.json`
- `.claude/memorygraph/**`
- `.codex/auth.json`
- `.mcp.json`
- `settings.local.json`
- project-local logs, traces, caches, task docs, verdicts
- `.moonshot-relay/**`
- `.moonshot-state/**`
- runtime DB/WAL/SHM files

## Dependencies

- Phases 02-07 complete.

## Implementation Work

- Include new runtime support scripts in common package payload.
- Materialize the runtime dependency strategy selected in Phase 02:
  - source package metadata and lockfile remain the dependency authority
  - account-root runtime support either installs required dependencies under the materialized support root or reports a typed degraded status
  - no package payload includes `node_modules`, generated sqlite files, traces, logs, verdicts, or local profile state
- Ensure profile templates reference shared runtime assets through `MOONSHOT_RELAY_HOME`.
- Keep generated DB/state/cache/verdict outputs excluded from package payloads.
- Update installer dry-run output if new support scripts must be reported.
- Document controlled adoption:
  - source checkout validation first
  - package materialization second
  - account-root install third
  - downstream sync only with explicit target list
- Use `skills/moonshot-relay-maintainer/scripts/sync_downstream_claude.py` only for conservative `.claude` sync and only after dry-run review.

## Acceptance Criteria

- Package dry-run includes new support scripts.
- Account-root installer dry-run succeeds.
- Existing project-local state is not part of owned entries.
- Runtime DB and generated artifacts remain outside package payload.
- Downstream sync policy preserves memory, settings, logs, traces, task docs, and verification artifacts.
- Temp-home installer smoke proves runtime-state CLI can initialize or returns a typed degraded status without claiming completion authority.

## Regression Contract

Use and extend:

- `tests/package-materialization.test.mjs`
- `tests/workflow-e2e-contract.test.mjs`
- `tests/migration-audit.test.mjs`

Required test cases:

- New runtime control-plane support scripts are packaged.
- Generated `runtime-state.sqlite*` files are excluded.
- Installer owned entries do not include project-local state.
- Account-root dry-run reports no destructive project-local deletion.
- Runtime dependency materialization is present in package/install contract or runtime-state support is explicitly degraded.

## Completion Evidence

- `npm test`
- `npm run test:package`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json --moonshot-home <temp> --claude-home <temp> --codex-home <temp>`
- `git diff --check`
