# QA Report

## Harness Change Ledger

- Date: 2026-07-08
- Scope: Spec-Test Obligation Gate for plan-driven TDD and per-spec verification.
- Changed areas:
  - Added `scripts/spec-test-obligations.mjs` and `schemas/spec-test-obligation.schema.json`.
  - Extended sprint, traceability, scenario, QA, scorecard, and task templates with `specTestObligations`.
  - Connected obligation failures and missing closeout results into verification-plane, runtime completion rejection, and phase-final guard.
  - Updated TDD, plan-writer, phase-runner, and completion-verifier skill contracts.
  - Added packaging coverage so the validator and schema are included in runtime payloads.
- Verification evidence:
  - RED tests first: spec-obligation validator/template tests and verification-plane closeout tests failed before implementation.
  - Targeted GREEN: `node --test tests\spec-test-obligations-contract.test.mjs tests\verification-plane-contract.test.mjs tests\workflow-e2e-contract.test.mjs`.
  - Full source gate: `npm test` -> 514 tests, 513 pass, 1 skipped.
  - Package gate: `npm run test:package` -> 56/56 pass.
  - Eval gate: `npm run test:eval` -> pass.
  - Harness Lab gate: `npm run test:lab` -> `status=passed`, `accountRootGuard=passed`, result `C:\dev\moonshot-relay\.moonshot-relay\harness-lab-runs\harness-lab-20260708-153648\lab-result.json`.
  - Doctor/audit: `node scripts\doctor.mjs check --json` pass; `node scripts\skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` pass.
  - Packaging dry-run: validator script and schema are present in runtime payload.
  - Independent review loop: initial review found closeout-result, fenced-example, critical-smoke, and duplicate-id risks; fixes were applied and a second read-only review found no blocker/P2 findings.
- Commit boundary:
  - Source changes only.
  - Generated lab state, account-root knowledge state, and local runtime artifacts are excluded from commit staging.

- Date: 2026-06-29
- Scope: containerized Harness Lab product lifecycle gate hardening.
- Changed areas:
  - Docker-backed baseline/candidate lifecycle wrapper and closeout verification.
  - Promotion boundary checks for runtime health, fixture identity, and Docker image identity.
  - Calibration compatibility for legacy baseline reruns without weakening normal promotion.
  - Public harness lab operating guide.
- Verification evidence:
  - `npm run lab:status`: Docker backend ready, current baseline `baseline-0016`.
  - `npm run lab:closeout`: `consumableByCommitWorkflow=true`, no blocking gates.
  - `node --test tests\harness-lab-contract.test.mjs`: 45/45 pass.
  - `npm test`: 368 tests, 367 pass, 1 skipped.
  - Independent safety review: no blocking findings for promote/closeout/runtime/image/fixture gates.
- Commit boundary:
  - Source changes only.
  - Generated lab state, account-root knowledge state, and local runtime artifacts are excluded from commit staging.
