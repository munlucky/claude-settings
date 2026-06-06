# Phase 01 - Baseline, Source Truth, and Adoption Boundary v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Freeze the current harness truth before implementation so later phases do not confuse canonical source, generated runtime state, package payload, account-root installed profiles, and local compatibility artifacts.

## Owned Paths

- `AGENTS.md`
- `README.md`
- `docs/public/repository-layout.md`
- `docs/public/installer-usage.md`
- `docs/public/runtime-state-cleanup.md`
- `docs/public/guidelines/external-skill-pattern-transfer.md`
- `package/package-contract.yaml`
- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`

## Read-Only Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- `package/claude/profile/**`
- `package/codex/profile/**`
- account-root homes
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files

## Dependencies

None.

## Implementation Work

- Confirm current canonical source boundaries and generated-state exclusions.
- Record that this roadmap is tracked under `docs/public/roadmaps/harness-control-plane-modernization/`; future temporary execution scratch space may still live under gitignored `docs/implementation/`.
- Add a durable architecture baseline section that names current runtime state roots, account-root project knowledge root, package payload ownership, and compatibility wrappers.
- Capture the baseline command set:
  - `npm test`
  - `npm run test:package`
  - package dry-run
  - account-root installer dry-run
- Record that `npm test` is an explicit command list today; later modernization contract tests must be added to that active gate rather than assumed discoverable.
- Record external harness pattern transfer policy:
  - accept patterns only
  - reject wholesale skill/import expansion
  - keep public entrypoints stable

## Acceptance Criteria

- Baseline docs identify canonical source, runtime profiles, generated state, and package payload without ambiguity.
- Package contract still excludes runtime DB, WAL, cache, traces, verdicts, browser artifacts, and memorygraph files.
- Existing active tests still pass.
- `tests/package-layout.test.mjs` is identified as the guard that should prevent new required contract tests from being omitted from `npm test`.

## Regression Contract

Select existing tests first:

- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- `tests/migration-audit.test.mjs`

Add assertions only if source/runtime/profile ownership ambiguity is not already covered.

## Completion Evidence

- `npm test`
- `npm run test:package`
- `git diff --check`
