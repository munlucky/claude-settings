# Phase 02 - Active Test Side-Effect And Archive Boundary v1

## Goal

Make active contract tests deterministic, read-only by default, and clearly separated from legacy archive compatibility specimens.

## Owned Paths

- `tests/active-contracts.test.mjs`
- `tests/legacy-archive-contract.test.mjs`
- `tests/harness-regression-contract.test.mjs`
- `package.json` only if test scripts need a `test:legacy` or equivalent split
- `agents/verification/verify-runtime.sh` only if runtime verifier options need a no-write/dry-run failure mode

## Read-Only Paths

- `archive/scripts/legacy-phase-adapters/**` except when adding explicit legacy tests is separately approved
- runtime `.claude/**`, `.codex/**`, `.moonshot-relay/**` generated state

## Required Changes

1. Remove direct execution of `archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs` from active contract tests, or move it under an explicit legacy/archive contract test that is not treated as active runtime evidence.
2. Make the browser-flow missing-runner test run in a temp workspace or inject a verdict path under an OS temp directory so it cannot create `.claude/runtime-verdict-*.json`.
3. Add assertions that failure-path verifier tests leave the repository clean of `.claude/runtime-verdict-*.json`, `.moonshot-relay/verification-verdict-*`, sqlite state, and cache/log artifacts.
4. Compare pre/post repository snapshots instead of asserting global artifact absence, because local runtime profiles may already contain historical generated state.
5. Gate Bash-specific runtime verifier tests with explicit Git Bash/MSYS detection. Windows `C:\Windows\system32\bash.exe` WSL launcher is not acceptable for shell-installer compatibility tests.
6. Prefer a Node-level contract for browser-flow setup-gap payload shape when Git Bash/MSYS is unavailable.
7. Preserve archive compatibility investigation coverage in `tests/legacy-archive-contract.test.mjs` or an explicitly named `npm run test:legacy-archive` script.
8. Add an assertion that active test files do not execute `archive/scripts/legacy-phase-adapters/**` as active runtime evidence, while legacy tests may import or execute archive specimens.

## Acceptance Criteria

- Active `npm test` does not execute archive scripts as active runtime gate evidence.
- A forced missing browser runner failure leaves no new generated verdict JSON in the repository-local `.claude`, `.codex`, `.moonshot-relay`, or `.moonshot-state` paths.
- Failure-path tests set `HARNESS_VERDICT_FILE`, `MOONSHOT_RELAY_HOME`, `USERPROFILE`, `HOME`, `TMP`, `TEMP`, `TMPDIR`, `BROWSERCTL_PATH`, and `BROWSER_FLOW_RUNNER_PATH` to temp-controlled paths.
- Windows without Git Bash/MSYS receives a clear skip plus Node-only setup-gap assertion for shell-specific paths.
- Legacy archive specimens remain testable through an explicit archive/legacy contract.
- `npm test` does not include `tests/legacy-archive-contract.test.mjs` unless that inclusion is explicitly justified by a separate assertion.

## Verification Commands

```powershell
npm test
npm run test:legacy-archive
node --test --test-name-pattern "active tests do not execute archive compatibility scripts" tests/active-contracts.test.mjs
node --test --test-name-pattern "browser flow missing runner uses temp verdict path and leaves repo state unchanged" tests/active-contracts.test.mjs
# The Node snapshot assertion is the authority because git status does not report ignored generated artifacts.
git status --porcelain -- .claude .codex .moonshot-relay .moonshot-state
node --test --test-name-pattern "active archive boundary scan has zero violations" tests/active-contracts.test.mjs
```

## Non-Goals

- Do not delete archive adapters.
- Do not make archive compatibility tests part of downstream installed-runtime completion evidence.
