# QA Report

Date: 2026-06-06

## Result

Status: pass

The workflow hardening run completed source/profile cleanup, plan readiness bridge, closeout schema/template, syntax/schema gates, browser-flow runner support, package dry-run precision, and synthetic workflow E2E regression coverage.

## Evidence

| Command | Result | Notes |
| --- | --- | --- |
| `node --test tests/workflow-e2e-contract.test.mjs` | pass | Plan readiness, closeout template, browser-flow runner, README active gate, profile document paths. |
| `node --test tests/syntax-schema-contract.test.mjs` | pass | JSON schema/template parsing, Node syntax, bash syntax, PowerShell parse. |
| `node --test tests/package-layout.test.mjs tests/package-materialization.test.mjs` | pass | Package contract, materialization, dry-run support script inclusion. |
| `npm test` | pass | 72 tests: 71 pass, 1 skip. |
| `npm run test:package` | pass | 35 tests pass. |
| `npm run test:legacy-archive` | pass | 3 tests pass; archive remains separate. |
| `node package/build-package.mjs --runtime all --dry-run --json` | pass | Claude planned copies: 427; Codex planned copies present. |
| `node scripts/install-account-root-harness.mjs --runtime all --source-root . --dry-run --json` | pass | Dry-run copied counts: moonshot 132, Claude 237, Codex 218. |
| `git diff --check` | pass | No whitespace errors. |

## Material Changes Covered

- Source checkout `AGENTS.md` now works as a real TOC instead of a profile-local pointer.
- Phase plan templates now generate plan-local paths and use `scripts/prepare-phase-runner-state.mjs`.
- Closeout JSON contract is defined by `schemas/plan-closeout.schema.json`.
- Runtime verifier default verdicts moved to `.moonshot-relay/*verdict*.json`.
- Browser flow smoke runner is packaged as `scripts/browser-flow-runner.mjs`.
- Package materializer denylist is path-aware and no longer treats every `fixtures`, `cache`, or `logs` segment as generated state.
- Active test gate now covers syntax/schema and workflow E2E regression.

## Residual Notes

- Git commit and account-root sync are final adoption actions after source verification.
- The browser-flow missing-runner bash integration test remains skipped on this Windows session because Git Bash/MSYS bash was unavailable; Node-level browser-flow runner and setup-gap contract tests passed.
