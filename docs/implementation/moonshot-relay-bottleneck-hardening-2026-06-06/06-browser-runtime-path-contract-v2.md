# 06 Browser Runtime Path Contract v2

## Goal

Fix browser runtime executable resolution and newline portability.

## Dependencies

- Phase 1 guard rules.
- Phase 3 browser-flow runner contract.

## Owned Paths

- `bin/browserctl`
- `.gitattributes`
- `scripts/install-browser-runtime.mjs`
- `tools/browserd/**`
- active browser runtime tests under `tests/`

## Work

- Enforce LF for `bin/browserctl` with `.gitattributes`.
- Add or update a CRLF executable scanner.
- Update `install-browser-runtime.mjs` to resolve browserctl from:
  - source checkout: `bin/browserctl`
  - account-root runtime: `<MOONSHOT_RELAY_HOME>/bin/browserctl`
  - project-local compatibility: `.claude/bin/browserctl`
- Add dry-run/self-test coverage for all intended resolver modes.

## Acceptance Evidence

- `bash bin/browserctl --help` no longer fails due CRLF.
- CRLF executable scanner reports 0 actionable failures for owned executable files.
- Browser runtime installer dry-run passes in source checkout mode.

## Phase Boundary

Do not assume `.claude/bin/browserctl` exists in account-root mode.
