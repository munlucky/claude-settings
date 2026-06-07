# Phase 06 - Package Smoke And Adoption Boundary

## Goal

Separate dry-run planning evidence from actual package and temp-home runtime smoke, while keeping live account-root mutation approval-only.

## Dependencies

- Phases 01 through 05.

## Owned Paths

- `package/build-package.mjs`
- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `docs/public/installer-usage.md`
- `docs/public/repository-layout.md`
- `docs/public/runtime-control-plane.md`
- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- `tests/workflow-e2e-contract.test.mjs`

## Read-Only Paths

- `C:\Users\moon\.moonshot-relay`
- `C:\Users\moon\.claude`
- `C:\Users\moon\.codex`
- live account-root state unless the user explicitly approves adoption

## Required Decisions

- Package dry-run checks planned payload only.
- Package smoke materializes a temp payload with `--out <temp> --clean` and runs that payload's `scripts/runtime-state.mjs status --json`.
- Installer dry-run checks planned target changes only.
- Temp-home smoke installs into explicit temp `MOONSHOT_RELAY_HOME`, `CLAUDE_HOME`, and `CODEX_HOME`, then runs installed runtime-state.
- Shared `scripts`, `bin`, `tools`, `schemas`, `docs/public`, `rules`, and `templates` remain under `MOONSHOT_RELAY_HOME`, not profile-local `.claude` or `.codex`.
- Native dependency missing or unsupported must produce typed degraded status that blocks authority claims.

## Smoke Shapes

Source smoke:

```powershell
node scripts/runtime-state.mjs status --json
```

Installer dry-run:

```powershell
node scripts/install-account-root-harness.mjs --runtime all --source-root . --dry-run --json
```

Package smoke:

```powershell
$pkgOut = Join-Path $env:TEMP ("moonshot-relay-payload-" + [guid]::NewGuid())
node package/build-package.mjs --runtime all --out $pkgOut --clean --json
$pkgHome = Join-Path $pkgOut "moonshot-relay\profile"
$env:MOONSHOT_RELAY_HOME = $pkgHome
node (Join-Path $pkgHome "scripts\runtime-state.mjs") status --json
```

Temp-home install smoke:

```powershell
$tmpRoot = Join-Path $env:TEMP ("moonshot-relay-install-" + [guid]::NewGuid())
$moonshotHome = Join-Path $tmpRoot ".moonshot-relay"
$claudeHome = Join-Path $tmpRoot ".claude"
$codexHome = Join-Path $tmpRoot ".codex"
node scripts/install-account-root-harness.mjs --runtime all --source-root . --moonshot-home $moonshotHome --claude-home $claudeHome --codex-home $codexHome --json
$env:MOONSHOT_RELAY_HOME = $moonshotHome
node (Join-Path $moonshotHome "scripts\runtime-state.mjs") status --json
```

Live account-root smoke:

- Requires explicit user approval.
- Requires state preservation evidence.
- Requires rollback evidence.
- Runs only in a controlled adoption phase.

## Acceptance Evidence

- Tests distinguish dry-run from actual package smoke.
- Tests distinguish installer dry-run from temp-home install smoke.
- Temp smoke proves installed `runtime-state.mjs` is available or typed degraded.
- Tests prove live roots are untouched by default gates.
- Tests prove `.claude/scripts` and `.codex/scripts` are not restored as shared runtime surfaces.
