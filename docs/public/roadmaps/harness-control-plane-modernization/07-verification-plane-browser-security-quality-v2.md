# Phase 07 - Verification Plane, Browser, Security, and Quality v2

## Goal

Unify unit, package, installer, browser, security, and quality checks as evidence-producing verification planes.

## Execution Metadata

- Dependencies: Phase 02, Phase 06.
- Owned paths: `skills/browser-verifier/**`, `skills/security-reviewer/**`, `skills/qa-flow/**`, `skills/completion-verifier/**`, `scripts/runtime-state.mjs`, `tests/github-ci-security-contract.test.mjs`, `tests/workflow-e2e-contract.test.mjs`, `tests/fixtures/harness-control-plane/**`, `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`.
- Read-only paths: generated traces, browser artifacts, verdict JSON, live account-root homes.
- Adoption targets: source verification flows, CI source config, generated evidence conventions.
- Live mutation policy: no live account-root mutation; generated verification artifacts remain untracked.
- Required evidence: fresh evidence fixture, browser trace fixture, security high/critical blocker fixture, `npm test`, package dry-run.
- Conflicts: stale evidence accepted as fresh, missing security scan treated as pass, generated trace/report package inclusion.
- Staged paths: verifier/security/browser/QA skill docs, runtime evidence wiring, CI/security tests.
- Closure traceability: verification evidence IDs, browser trace evidence path, security gate fixture output.

## Required Work

- Keep `npm test` as the active default regression gate.
- Keep package and installer dry-runs in the required harness verification set.
- Add browser trace standardization for browser-verifier and QA flows.
- Add security-reviewer consumption of CodeQL, dependency review, Dependabot, and secret scanning policy status.
- Record verification results into runtime events/eval results.
- Ensure verification evidence is fresh for the run/goal identity.

## Acceptance Criteria

- Fresh verification evidence is required before accepted completion.
- Browser traces are isolated, reproducible, and linked as evidence.
- Security high/critical findings, stale scans, and missing required scans block release/accepted completion unless an explicit owner-approved exception is recorded.
- Generated traces and reports remain excluded from package payload.

## Regression Contract

- Stale verification evidence cannot produce accepted completion.
- Browser trace evidence is generated under excluded runtime artifact roots.
- CodeQL/dependency/security high or critical findings block release claims.
- Verification results are linked to run/goal identity.
- Missing scan, stale scan, high/critical CodeQL finding, vulnerable dependency review finding, and secret scanning finding are distinct blocker fixtures.

## Completion Evidence

- `npm test`
- `node --test tests/security-gate-contract.test.mjs` or the active equivalent fixture in `npm test`
- Browser trace smoke or documented deferred fixture
- Security blocker fixture
- Package exclusion check for generated traces/reports
