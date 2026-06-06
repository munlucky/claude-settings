# Phase 05 - Installer Runtime Platform v1

## Objective

Bring installer and runtime behavior in line with account-root contracts across Windows, Git Bash/macOS compatibility, and WSL/Linux guidance.

## Phase Execution Metadata

```yaml
phase: 05
dependsOn: [01, 04]
ownedPaths:
  - install-claude.ps1
  - install-claude.sh
  - bin/moonshot-relay.mjs
  - scripts/install-account-root-harness.mjs
  - scripts/install-browser-runtime.mjs
  - scripts/lib/runtime-state-root.mjs
  - scripts/project-identity.mjs
  - README.md
  - docs/public/installer-usage.md
  - docs/public/repository-layout.md
  - docs/public/runtime-state-cleanup.md
  - tests/migration-audit.test.mjs
  - tests/package-materialization.test.mjs
  - tests/active-contracts.test.mjs
readOnlyPaths:
  - package/package-contract.yaml
  - package/build-package.mjs
liveMutationPolicy: all install verification uses --dry-run or temp homes only
```

## Issue E1 - PowerShell Installer Contract

| Loop | Result |
|------|--------|
| Improvement v1 | Update PS1 docs but keep project-local copy behavior. |
| Review 1 | This leaves the account-root contract broken. |
| Improvement v2 | Make PS1 default wrap `node bin/moonshot-relay.mjs install --runtime all`; keep project-local mode explicit. |
| Review 2 | Need dry-run JSON and argument parity tests. |
| Final v3 | Convert PS1 to account-root wrapper with `-DryRun`, `-NoBackup`, runtime, and temp-home support. Legacy project-local behavior only through explicit mode or deprecation. |

## Issue E2 - Runtime State Legacy Override

| Loop | Result |
|------|--------|
| Improvement v1 | Keep `MOONSHOT_STATE_ROOT` and `PHASE_RUNTIME_STATE_ROOT` first, document them as legacy. |
| Review 1 | They still override account-root knowledge writes. |
| Improvement v2 | Resolve Project Identity knowledgeRoot first and use legacy env only as fallback. |
| Review 2 | Current `MOONSHOT_RELAY_STATE_ROOT` and legacy `CODEX_STATE_ROOT` must remain distinguishable. |
| Final v3 | Make `MOONSHOT_RELAY_STATE_ROOT` the current account-state override, `CODEX_STATE_ROOT` legacy, and prevent `MOONSHOT_STATE_ROOT`/`PHASE_RUNTIME_STATE_ROOT` from hijacking new default writes without explicit compatibility mode. |

## Issue E3 - Browser Runtime Mixed Root

| Loop | Result |
|------|--------|
| Improvement v1 | Prefer source checkout in candidate ordering. |
| Review 1 | Current resolver can still pick `bin` from one root and `tools` from another. |
| Improvement v2 | Select one runtime root first, then resolve all entrypoints inside it. |
| Review 2 | Need explicit root priority and split-root failure evidence. |
| Final v3 | Add `resolveBrowserRuntimeRoot()` with explicit root, source checkout, `MOONSHOT_RELAY_HOME`, then project-local compatibility. Reject mixed roots and test fake split roots. |

## Issue E4 - Bin Wrapper Dry-Run Test

| Loop | Result |
|------|--------|
| Improvement v1 | Test `scripts/install-account-root-harness.mjs --dry-run`. |
| Review 1 | Missing path is `bin/moonshot-relay.mjs install --dry-run`. |
| Improvement v2 | Add bin wrapper dry-run test. |
| Review 2 | Must pass temp homes to avoid touching real account root. |
| Final v3 | Add temp-home test asserting mode, dryRun, targetRoot, nonzero copiedCount, and no manifest/write side effects. |

## Issue E5 - Install Guidance Priority

| Loop | Result |
|------|--------|
| Improvement v1 | Add “npx also possible” to README. |
| Review 1 | This does not fix quick-start ordering or bootstrap/full-install confusion. |
| Improvement v2 | Make `npx -y github:munlucky/moonshot-relay install` primary. |
| Review 2 | Need a priority table and static tests. |
| Final v3 | Standardize order: full account-root npx, source checkout Node, Agent Skills bootstrap, Git Bash/macOS compatibility, project-local compatibility, PowerShell wrapper. Add static test that bootstrap is not presented as full install. |

## Acceptance Criteria

- PS1 default no longer performs implicit project-local `.claude/.codex` copy.
- Runtime state default writes use account-root project knowledge unless explicit compatibility mode is selected.
- Browser runtime installer cannot mix roots.
- Bin wrapper dry-run is covered with temp homes.
- README/package/public installer docs agree on install priority.

## Verification

- `npm test`
- `npm run test:package`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- `node bin/moonshot-relay.mjs install --dry-run --json --moonshot-home <tmp> --claude-home <tmp> --codex-home <tmp>`
- `pwsh -File install-claude.ps1 -DryRun` or equivalent parser/smoke on Windows
- Targeted browser runtime split-root tests

## Risks

- Existing users may rely on PS1 project-local behavior. Keep it explicit or document deprecation.
