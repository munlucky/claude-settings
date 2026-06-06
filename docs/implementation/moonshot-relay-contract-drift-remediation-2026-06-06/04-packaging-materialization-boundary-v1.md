# Phase 04 - Packaging Materialization Boundary v1

## Objective

Reconcile plugin metadata, package contract wording, build-package allowlists, and generated/runtime exclusion guards without reintroducing archived or generated payloads.

## Phase Execution Metadata

```yaml
phase: 04
dependsOn: [01]
ownedPaths:
  - .claude-plugin/plugin.json
  - .codex-plugin/plugin.json
  - package/build-package.mjs
  - package/package-contract.yaml
  - tests/plugin-manifest.test.mjs
  - tests/package-layout.test.mjs
  - tests/package-materialization.test.mjs
readOnlyPaths:
  - scripts/lib/runtime-state-db-path.mjs
  - scripts/lib/runtime-state-root.mjs
  - package/README.md
liveMutationPolicy: do not commit generated package/claude/profile or package/codex/profile
```

## Issue D1 - Plugin Manifest Entries Too Broad

| Loop | Result |
|------|--------|
| Improvement v1 | Narrow `entries` so broad `scripts` is not exposed as payload. |
| Review 1 | Plugin discovery may need canonical source entries. |
| Improvement v2 | Add metadata clarifying `entries` are canonical inputs and materializer is payload authority. |
| Review 2 | New schema fields may not be understood externally. |
| Final v3 | Preserve compatibility but document and test that plugin manifest entries are not payload promises; generated profile root and materializer dry-run are authoritative. |

## Issue D2 - runtime-state-db-path Allowlist

| Loop | Result |
|------|--------|
| Improvement v1 | Add `scripts/lib/runtime-state-db-path.mjs` to Claude sharedFiles. |
| Review 1 | Do not copy `scripts/lib/**` wholesale. |
| Improvement v2 | Add only the helper plus characterization tests. |
| Review 2 | Avoid treating all test imports as runtime payload requirements. |
| Final v3 | Package the helper only if runtime-owned shipped scripts need it; otherwise narrow contract text to source-only. Add required payload test if packaged. |

## Issue D3 - Contract `scripts/lib/**` vs Allowlist

| Loop | Result |
|------|--------|
| Improvement v1 | Replace broad contract expression with concrete entries. |
| Review 1 | Verbose but safer than implying wholesale copy. |
| Improvement v2 | Add `supportLibraryAllowlist` with concrete file list. |
| Review 2 | Manual lists can drift. |
| Final v3 | Add parity test between contract allowlist and `runtimeSpecs.claude.sharedFiles` for `scripts/lib/*`; reject `source: scripts/lib/**`. |

## Issue D4 - Generated Runtime Payload Exclusion

| Loop | Result |
|------|--------|
| Improvement v1 | Keep current denylist untouched while changing allowlists. |
| Review 1 | `runtime-state-db-path.mjs` sounds like generated DB state and needs positive/negative distinction. |
| Improvement v2 | Allow resolver source code but keep `runtime-state.sqlite*` denied. |
| Review 2 | Account-root `.moonshot-relay/state` examples should be tested as generated state, not fixtures. |
| Final v3 | Add explicit regression examples for account-root state, memorygraph, verdicts, logs, cache, traces, and generated profiles remaining excluded. |

## Acceptance Criteria

- Materializer dry-run remains the payload authority.
- No archive, fixture, test, sqlite, log, cache, trace, memorygraph, verdict JSON, or generated profile path appears in planned payloads.
- Contract and build script agree on support library allowlist.

## Verification

- `npm run test:package`
- `node --test tests/plugin-manifest.test.mjs tests/package-layout.test.mjs tests/package-materialization.test.mjs`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `git ls-files package/claude/profile package/codex/profile`

## Risks

- Adding support files to Codex profile payload would blur the common runtime boundary. Keep Codex scripts out unless a direct runtime requirement is proven.
