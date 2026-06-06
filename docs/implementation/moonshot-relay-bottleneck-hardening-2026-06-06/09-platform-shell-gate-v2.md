# 09 Platform Shell Gate v2

## Goal

Expand the default completion evidence beyond `npm test` so shell, installer, package, and runtime contract drift is caught.

## Dependencies

- Phase 2 archive boundary removal.
- Phase 5 install command contract.
- Phase 6 browser runtime path contract.
- Phase 8 materialization dry-run contract.

## Owned Paths

- `package.json`
- `tests/**`
- `README.md`
- `install-claude.sh`
- `install-claude.ps1`
- `bin/**`

## Work

- Add executable CRLF checks for `bin/*`, `*.sh`, and shebang-bearing `*.py`, `*.mjs`, and `*.js`.
- Keep PowerShell-safe examples tests.
- Add explicit smoke coverage for supported installer commands.
- Clarify unsupported shell behavior for `install-claude.sh` or route Linux/WSL users to the Node installer.
- Define the final closeout gate command list.

## Acceptance Evidence

- `npm test` passes.
- `npm run test:package` passes.
- `node package/build-package.mjs --runtime all --dry-run --json` returns planned paths.
- `node bin/moonshot-relay.mjs install --dry-run --runtime all` passes.
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json` passes.
- `bash bin/browserctl --help` passes or is replaced by an equivalent supported shell smoke.

## Phase Boundary

This phase consolidates evidence; it must not weaken earlier guards to make the final gate green.
