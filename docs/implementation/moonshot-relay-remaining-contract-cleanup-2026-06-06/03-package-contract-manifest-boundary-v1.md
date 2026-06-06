# Phase 03 - Package Contract Manifest Boundary v1

## Goal

Align package contract metadata, materializer dry-run semantics, and plugin manifests so consumers cannot confuse broad source entries with installed runtime payload.

## Owned Paths

- `package/package-contract.yaml`
- `package/build-package.mjs`
- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/marketplace.json`
- `tests/package-materialization.test.mjs`
- `tests/package-layout.test.mjs`
- `tests/plugin-manifest.test.mjs`

## Read-Only Paths

- generated `package/claude/profile/**`
- generated `package/codex/profile/**`
- account-root runtime profiles and state

## Required Changes

1. Expand `excludedGeneratedState` in `package/package-contract.yaml` to include `.moonshot-state/**`.
2. Add Codex local runtime-state exclusions, including `.codex/cache/**`, `.codex/sqlite/**`, `.codex/memories/**`, and `.codex/sessions/**`, when they are generated/runtime-local rather than source payload.
3. Mitigate broad plugin `entries` risk by removing broad `scripts` from consumer-facing install payload fields. Add a descriptor only if existing plugin schema requires a replacement field; do not invent a new schema unless necessary.
4. Review dry-run generated payload denylist matching so source files such as `scripts/verification-verdict-state.mjs` are not falsely classified as generated verdict payload.
5. Keep generated payload exclusion tests aligned with builder behavior and contract metadata.
6. Implement Codex runtime exclusions in both contract metadata and builder/test behavior, not metadata only.

## Acceptance Criteria

- Contract metadata and package tests agree on every generated-state exclusion.
- `package/package-contract.yaml`, package tests, and builder deny behavior explicitly cover `.moonshot-state/**`, `.codex/cache/**`, `.codex/sqlite/**`, `.codex/memories/**`, and `.codex/sessions/**`.
- Plugin tests prove `payloadAuthority` and `entriesRole` are present and fail if a consumer-facing install payload field contains broad `scripts`.
- Dry-run JSON planned output remains available and does not report false generated-payload violations for legitimate source files.
- Dry-run tests parse the JSON `planned` array and assert `scripts/verification-verdict-state.mjs` is allowed as source payload when selected by the materializer, while verdict outputs such as `.claude/verification-verdict-*.json` remain excluded.
- `node package/build-package.mjs --runtime all --dry-run --json` succeeds.

## Verification Commands

```powershell
npm run test:package
node package/build-package.mjs --runtime all --dry-run --json
rg -n "excludedGeneratedState|payloadAuthority|entriesRole|\\.codex/(cache|sqlite|memories|sessions)|\\.moonshot-state" package .claude-plugin .codex-plugin tests
```

## Non-Goals

- Do not change package publishing mechanics unless required by manifest authority.
- Do not include generated profile payloads in Git.
