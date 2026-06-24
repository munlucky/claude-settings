# Phase 04 - Runtime Package Adoption Gate v1

Status: complete

## Objective

Gate any runtime, package, or live profile adoption of Ponytail-derived functionality through Moonshot Relay's existing package and profile parity controls.

## Dependencies

- Phase 03 adoption decision.

## Owned Paths

- `package/runtime-surface.json` only with explicit approval.
- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `scripts/doctor.mjs`
- `skills.lock.json` only for explicitly approved rollback dry-run that reverts a Phase 03 managed skill branch.
- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- `tests/plugin-manifest.test.mjs`
- `tests/skills-doctor-contract.test.mjs`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`

## Read-only Paths

- `skills.lock.json`
- `schemas/verification.contract.yaml`
- `docs/public/installer-usage.md`
- `docs/public/runtime-control-plane.md`
- Upstream pinned Ponytail plugin/hook files from Phase 01.

## Staged Paths

- Package/runtime files and tests only if Phase 03 selected managed adoption.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/phase-04/`

## Execution Metadata

```yaml
phase: "04"
dependsOn:
  - "03"
writeSetBoundary:
  allowed:
    - "package/runtime-surface.json"
    - "package/package-contract.yaml"
    - "scripts/install-account-root-harness.mjs"
    - "scripts/doctor.mjs"
    - "skills.lock.json"
    - "tests/package-layout.test.mjs"
    - "tests/package-materialization.test.mjs"
    - "tests/plugin-manifest.test.mjs"
    - "tests/skills-doctor-contract.test.mjs"
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/**"
  conditional:
    - "package/runtime-surface.json only with explicit public runtime skill expansion approval"
    - "installer changes only when managed plugin/hook package adoption is selected"
    - "skills.lock.json only for explicitly approved rollback dry-run that reverts a Phase 03 managed skill branch"
  forbidden:
    - ".claude/**"
    - ".codex/**"
    - "account-root profile installation"
    - "runtime sqlite/state mutation"
conflicts:
  - "Concurrent package materialization or runtime-surface policy changes."
  - "Any live account-root sync before Phase 05 approval and closeout evidence."
adoptionTarget: "package-adoption-gate"
graphReadiness: "markdown-only"
```

## Live Mutation Policy

Live account-root/profile adoption is still blocked during implementation. This phase may run package dry-runs only.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P04-1 | Decide whether Ponytail-derived behavior belongs in public runtime skills, internal support docs, or user-managed plugin instructions. | Runtime surface decision. |
| P04-2 | If public skill expansion is approved, update runtime surface and package tests. | Runtime-surface diff plus tests. |
| P04-3 | If hooks are managed, add explicit hook permission and timeout review before package inclusion. | Hook adoption gate. |
| P04-4 | Run package materialization dry-run and profile-surface parity checks without live install. | Dry-run evidence. |
| P04-5 | Document rollback: remove runtime-surface entry, regenerate lock, reinstall previous profile payload. | Rollback note. |

## Expected Evidence Artifacts

| Artifact | Required Fields |
|---|---|
| `phase-04/runtime-surface-approval.md` | approver, approval source, scope, approved paths, denied paths, date, exact adoption branch, runtime-surface entries approved |
| `phase-04/runtime-adoption-skipped.md` | required when Phase 03 selects `instruction_tier_only`, `user_managed_plugin_documented`, or `rejected`; records no runtime-surface diff |
| `phase-04/package-dry-run.json` | output of `node package/build-package.mjs --runtime all --dry-run --json` |
| `phase-04/skills-audit.json` | output of skills audit after any skill/runtime-surface changes |
| `phase-04/hook-smoke-report.md` | normal run, timeout, missing Node, denied env, filesystem write behavior, verdict; required only for managed hooks |
| `phase-04/rollback-manifest.yaml` | prior runtime-surface hash, prior skills.lock hash when applicable, package dry-run artifact path, reinstall command, verification commands |
| `phase-04/rollback-dry-run.md` | rollback steps and dry-run result, or explicit not-applicable reason for skipped runtime adoption |

## Acceptance Criteria

- No live profile mutation occurs in this phase.
- Runtime-surface expansion, if any, is explicitly approved and tested.
- Package payload excludes generated state, logs, caches, traces, sqlite state, memorygraph data, and verdict JSON.
- Hook commands do not assume interactive shell state and degrade cleanly if Node is unavailable.
- Package dry-run succeeds.
- Runtime-surface expansion cannot proceed without `phase-04/runtime-surface-approval.md`.
- Hook adoption cannot proceed without `phase-04/hook-smoke-report.md` covering normal run, timeout, missing Node, and denied environment.
- Rollback manifest captures prior payload/hash/install targets before managed package adoption.
- Rollback is dry-run verified in `phase-04/rollback-dry-run.md`, or runtime adoption is explicitly skipped.

## Verification Signals

- `node package/build-package.mjs --runtime all --dry-run --json`
- `npm run test:package`
- `node scripts/doctor.mjs check --json`
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-04/runtime-surface-approval.md` when runtime surface changes.
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-04/runtime-adoption-skipped.md` when runtime adoption is skipped.
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-04/hook-smoke-report.md` when managed hooks are selected.

## Review-Improvement Loop

Review focus: package boundary, managed-vs-external plugin boundary, and live adoption rollback.

## Closeout Decision

Phase 05 may perform measured local validation. Live adoption remains skipped unless explicit approval is provided.

## Expected Closeout Artifacts

- `execution/phase-04/SCORECARD.md`
- `execution/phase-04/QA_REPORT.md`
- `execution/phase-04/HANDOFF.md`
- `phase-04/runtime-surface-approval.md` or `phase-04/runtime-adoption-skipped.md`
- `phase-04/package-dry-run.json`
- `phase-04/skills-audit.json`
- `phase-04/hook-smoke-report.md` when managed hooks are selected
- `phase-04/rollback-manifest.yaml`
- `phase-04/rollback-dry-run.md`

## Phase 04 Closeout

Selected branch: `instruction_tier_only`.

Runtime/package adoption is skipped because Phase 03 selected `instruction_tier_only` and recorded `requires_phase_04: false`. Phase 04 still ran package dry-run, package tests, skills audit, and doctor checks to confirm the package boundary remains healthy.

Closeout artifacts:

- `phase-04/runtime-adoption-skipped.md`
- `phase-04/package-dry-run.json`
- `phase-04/skills-audit.json`
- `phase-04/rollback-manifest.yaml`
- `phase-04/rollback-dry-run.md`
- `execution/phase-04/SCORECARD.md`
- `execution/phase-04/QA_REPORT.md`
- `execution/phase-04/HANDOFF.md`
- `execution/phase-04/phase-decision.yaml`

Verification:

- `node package/build-package.mjs --runtime all --dry-run --json` passed and was captured in `phase-04/package-dry-run.json`.
- `npm run test:package -- --runInBand` passed 40 tests.
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` returned `status: pass`.
- `node scripts/doctor.mjs check --json` returned `status: pass`.
