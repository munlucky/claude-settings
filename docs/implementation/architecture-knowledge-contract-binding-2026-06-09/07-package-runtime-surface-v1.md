# Phase 07 - Package Runtime Surface v1

## Objective

Update package contracts and materialization tests so the new runtime support scripts and schemas are included in the shared common payload while public profile-local skill discovery stays unchanged.

## Dependencies

- Phase 06.

## Owned Paths

- `package/package-contract.yaml`
- `package/build-package.mjs`
- `tests/package-layout.test.mjs`
- `tests/package-materialization.test.mjs`
- `package/README.md`

## Read-only Paths

- `package/runtime-surface.json`
- `.claude/**`
- `.codex/**`
- `%USERPROFILE%/.moonshot-relay/**`
- `%USERPROFILE%/.claude/**`
- `%USERPROFILE%/.codex/**`

## Staged Paths

- `package/moonshot-relay/profile/` generated output only during local materialization checks; do not commit generated payload.

## Adoption Targets

- Package common payload.
- Temp-home dry-run or materialization smoke only when needed.

## Live Mutation Policy

Live account-root install is not part of this phase. If live adoption is later requested, it must be a separate explicit closeout with source-to-install parity checks.

## Acceptance Criteria

- New scripts are included in the common Moonshot Relay runtime payload.
- New schemas are included in common payload.
- Generated JSON artifacts such as `ARCHITECTURE_KNOWLEDGE_SLICE.json`, `ARCHITECTURE_CONTRACT_SLICE.json`, `ARCHITECTURE_HANDOFF.json`, and `ARCHITECTURE_FEEDBACK.json` are not source package payload unless stored as test fixtures.
- `package/runtime-surface.json` public runtime skills do not change.
- Internal skill public exposure does not expand.
- Protected runtime state remains preserved.
- Before/after diff or assertion confirms `publicRuntimeSkills` remains stable while common payload support scripts/schemas expand.

## Verification Signals

- `npm run test:package`
- `node package/build-package.mjs --runtime all --dry-run --json` if supported by the current CLI shape, or equivalent package materialization test command.
- Runtime-surface invariant check: `package/runtime-surface.json` `publicRuntimeSkills` unchanged.

## Handoff Notes

This phase should be reviewed carefully because package drift can silently break installed runtime behavior even when source tests pass.
