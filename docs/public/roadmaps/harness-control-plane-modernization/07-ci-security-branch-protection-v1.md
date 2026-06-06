# Phase 07 - CI, Security, and Branch Protection v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Add repository-level CI/security source configuration and document required GitHub branch protection settings for the harness modernization gate.

## Owned Paths

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `docs/public/installer-usage.md`
- `docs/public/repository-layout.md`
- `README.md`
- `tests/github-ci-security-contract.test.mjs`

## Read-Only / Preserved Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- account-root homes; CI installer checks must use temp `--moonshot-home`, `--claude-home`, and `--codex-home`
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files

## Dependencies

- Phase 02 complete.
- Phase 06 complete.

## Implementation Work

- Add CI workflow:
  - checkout
  - setup Node on `windows-latest`, `ubuntu-latest`, and `macos-latest`
  - supported Node matrix from repository engine policy
  - `npm ci`
  - `npm test`
  - `npm run test:package`
  - package dry-run
  - account-root installer dry-run with temp homes
- Add CodeQL workflow for JavaScript/TypeScript.
- Add Dependabot config for npm and GitHub Actions.
- Add CODEOWNERS for harness-critical roots.
- Set minimum workflow hardening:
  - least-privilege `permissions`
  - `concurrency` cancellation for duplicate branch runs
  - pinned or policy-approved action versions
  - dependency review where available
  - Dependabot grouping for npm and GitHub Actions
- Document required branch protection:
  - CI test workflow required
  - CodeQL required for supported branches
  - review required for `scripts/`, `skills/`, `agents/`, `schemas/`, `package/`, `.github/`
  - no bypass for direct main pushes
- Ensure CI does not depend on local account-root state.
- Add CI checks that fail if new modernization contract tests are not included in active `npm test`.

## Acceptance Criteria

- GitHub config files exist and parse as text/YAML.
- CI references active commands only; no archive default execution.
- Installer dry-run in CI asserts dry-run mode and temp-home targeting, and reports no project-local deletion.
- Required branch protection is documented, not assumed to be automatically applied.

## Regression Contract

Add `tests/github-ci-security-contract.test.mjs`.

Required test cases:

- CI workflow contains all required commands.
- CodeQL workflow targets JavaScript/TypeScript.
- Dependabot covers npm and GitHub Actions.
- CODEOWNERS covers critical harness roots.
- Docs name required checks.
- CI contains OS and Node matrix for native dependency smoke.
- Installer dry-run uses temp homes and asserts `dryRun: true`, no destructive deletion, and no live account-root mutation.

## Completion Evidence

- `node --test tests/github-ci-security-contract.test.mjs`
- `npm test`
- `git diff --check`
