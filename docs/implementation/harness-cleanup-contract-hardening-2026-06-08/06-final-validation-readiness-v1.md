# Phase 06 - Final Validation Readiness v1

## Purpose

Close the whole cleanup plan with verification evidence mapped to Moonshot Relay's required planes and completion authority.

## Execution Metadata

```yaml
phase: 06
title: Final Validation Readiness
dependsOn:
  - 01-git-safe-child-process-v1
  - 02-runtime-error-classifier-v1
  - 03-observability-contract-fields-v1
  - 04-prompt-gate-surface-v1
  - 05-runtime-skill-package-surface-v1
conflictsWith: []
ownedPaths:
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/06-final-validation-readiness-v1.md
readOnlyPaths:
  - all source paths except final validation doc
sharedMutablePaths: []
adoptionTargets: []
liveMutationPolicy: no_live_account_root_mutation
```

## Validation Matrix

| Plane | Commands / Evidence | Acceptance |
|---|---|---|
| unit | `npm test` plus focused phase suites | 0 fail |
| package | `npm run test:package`; `node package/build-package.mjs --runtime all --dry-run --json` | profile exposes 5 skills; common payload preserves full skills |
| eval | `npm run test:eval` | no worsened regression |
| installer | `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`; temp-home smoke if needed | no live account-root mutation |
| browser | not applicable unless UI/browser surface changes | explicit not-applicable evidence |
| security | git-safe contract; plugin path-boundary tests; `git diff --check` | no unsafe Git/path drift |
| quality | objective `rg` checks for direct Git calls, deprecated gate default usage, and 6-skill docs drift | no active contract leak |

## Final Closure Checks

```powershell
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/00-master-plan-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/01-git-safe-child-process-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/02-runtime-error-classifier-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/03-observability-contract-fields-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/04-prompt-gate-surface-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/05-runtime-skill-package-surface-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/06-final-validation-readiness-v1.md
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/plan-quality-review-iter-01.yaml
Test-Path docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/accepted-change-directives-v1.yaml
rg -n "git-safe|runtimeStoreErrorCode|decisionFields|reportingFields|runtime-surface|plugin" docs/implementation/harness-cleanup-contract-hardening-2026-06-08
rg -n "moonshot-plan-writer" README.md package/README.md docs/public/installer-usage.md docs/public/repository-layout.md package/package-contract.yaml tests
rg -n "spawnSync\('git'|execFileSync\('git'|execSync\('git'" scripts tests package bin tools
node scripts/runtime-state.mjs status --json
node scripts/runtime-state.mjs assess-completion --json
```

Expected final states:

- `moonshot-plan-writer` appears only as common/internal support, not public runtime discovery.
- Direct active Git child-process calls appear only in `scripts/lib/git-safe.mjs` outside `archive/**`.
- `runtime-state.mjs status --json` returns `available` or a typed degraded payload with `recoveryHint`.
- `runtime-state.mjs assess-completion --json` returns `accepted` before whole-plan clean completion is claimed.

## Completion Rule

This phase is not an implementation shortcut. It closes only after the prior phases have produced evidence and final validation commands pass or record explicit non-applicable evidence for browser plane.
