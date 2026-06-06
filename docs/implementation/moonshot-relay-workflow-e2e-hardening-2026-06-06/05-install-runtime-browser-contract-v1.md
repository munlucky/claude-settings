# Phase 05 - Install Runtime Browser Contract

## Goal

Make account-root sync safe for browser/runtime dependencies and visible configuration drift.

## Scope

- `scripts/install-account-root-harness.mjs`
- `scripts/install-browser-runtime.mjs`
- `agents/verification/verify-runtime.sh`
- `tools/browserd/**`
- `install-claude.sh`
- `package/profile-templates/codex/.codex/config.toml`
- tests

## Tasks

1. Prevent account-root reinstall from deleting browserd dependencies without rebootstrap.
2. Move browser runtime dependency state out of replace-owned `tools/`, or add installer bootstrap after replacement.
3. Resolve the missing default `browser-flow-runner.mjs`: package a smoke runner or make browser-flow opt-in/setup-gap by design.
4. Add Codex config drift warning or opt-in `--update-codex-config`.
5. Update browserd docs to distinguish source checkout, account-root runtime, and project-local compatibility state.
6. Add symlink fallback for project-local `AGENTS.md` bridge.
7. Stop project-local installer from wholesale-copying workflow scripts, or mark it legacy compatibility with tests.
8. Move default verdict output out of source `.claude` or require explicit compatibility mode.

## Acceptance

- Account-root actual install cannot leave browserctl broken due to removed dependencies.
- Dry-run reports config drift/protected config warnings.
- Browser-flow runner status is explicit and test-covered.
