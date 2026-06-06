# QA Report

Plan: `00-master-plan-v2.md`

## Result

Status: passed

## Evidence

- `npm test`: passed, 48/48 tests.
- `npm run test:package`: passed, 32/32 tests.
- `node package/build-package.mjs --runtime all --dry-run --json`: passed; dry-run returns planned copy sets.
  - claude: `copiedCount=418`, `plannedCount=418`
  - codex: `copiedCount=327`, `plannedCount=327`
- `node bin/moonshot-relay.mjs install --dry-run --runtime all`: passed.
  - moonshot-relay: 124 files
  - claude: 237 files
  - codex: 218 files
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`: passed.
  - moonshot-relay: 124 files
  - claude: 237 files
  - codex: 218 files
- `bash bin/browserctl --help`: passed.
- `git diff --check`: passed.

## Contract Coverage

- Boundary guards added for profile-local guideline references, personal absolute paths, default archive execution commands, MemoryGraph stale default seed paths, installer WSL/Linux routing, executable CRLF, package dry-run planning, and browser-flow setup gaps.
- Active tests no longer import archive runtime helpers for migration state checks.
- Archive verifier execution remains only as an explicit compatibility specimen test.
- Browser-flow missing runner now records structured `setup_gap` verdict fields.
- `docs/public/guidelines/**` is the canonical source target for active guideline references and is included through package materialization.
- MemoryGraph default guidance now points at `.moonshot-relay` state/cache paths; `.claude` memory paths are legacy compatibility/denylist references only.

## Harness Change Ledger

- Added active contract tests for boundary drift, archive default execution, MemoryGraph state-root drift, dry-run materialization, executable CRLF, installer routing, and browser-flow setup gaps.
- Promoted small archive-dependent state/path diagnostics into active `scripts/lib/**` helpers.
- Updated runtime verification and browser install helpers without editing installed account-root profiles.
- Replaced default maintainer archive gate commands with active package/install/runtime checks.

## Residual Risk

- Existing historical plan/evidence snapshots outside the active surface may still mention old profile-local paths.
- This run did not sync installed account-root profiles; the plan remains source/package-only.
