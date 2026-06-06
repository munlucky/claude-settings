# Phase 10 - CI, Security, Release, and Branch Protection v2

## Goal

Turn tracked CI/security config and GitHub operational settings into enforced release gates.

## Execution Metadata

- Dependencies: Phase 02, Phase 07, Phase 08.
- Owned paths: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `docs/public/installer-usage.md`, `docs/public/repository-layout.md`, `tests/github-ci-security-contract.test.mjs`.
- Read-only paths: GitHub repository settings until an explicit operational step applies them.
- Adoption targets: source config, GitHub settings documentation, later GitHub UI/API operation.
- Live mutation policy: do not change remote branch protection during source planning; document required settings and apply only in controlled release step.
- Required evidence: workflow parse fixture, required check name fixture, least-privilege permissions fixture, branch protection operation checklist.
- Conflicts: source config pass represented as protected release, missing required check names, live GitHub settings mutation during planning.
- Staged paths: GitHub workflow/config source, installer/release docs, CI/security tests.
- Closure traceability: source CI ready evidence, GitHub settings applied evidence, protected release evidence.

## Required Work

- Maintain CI commands: `npm ci`, `npm test`, `npm run test:package`, package dry-run, installer dry-run.
- Run OS/Node matrix before native dependency rollout.
- Keep CodeQL, Dependabot, CODEOWNERS, least-privilege permissions, and concurrency controls.
- Document branch protection required checks and CODEOWNERS review requirements.
- Add release gate documentation for dependency review and secret scanning policy.
- Distinguish source config from GitHub settings that must be applied in the repository UI/API.

## Acceptance Criteria

- CI source parses and includes required commands.
- Branch protection requirements are documented and matched to actual check names.
- Release cannot be claimed until GitHub settings are applied or explicitly listed as pending operational work.
- Temp-home installer dry-runs do not mutate live account-root profiles.
- `source-ci-ready`, `github-settings-applied`, and `release-protected` are separate statuses.
- Final protected release requires GitHub branch protection/API evidence; pending settings can only close source planning, not release protection.

## Regression Contract

- CI workflow includes `npm ci`, `npm test`, `npm run test:package`, package dry-run, and installer dry-run.
- CodeQL, Dependabot, CODEOWNERS, least-privilege permissions, and concurrency controls parse.
- Branch protection settings are documented as operational requirements, not implied by source files alone.
- Temp-home installer dry-run cannot mutate live account-root profiles.
- Required check names are stable and mapped to workflow jobs.

## Completion Evidence

- `npm test`
- CI workflow parse fixture
- Required check name list
- Branch protection operation checklist
- GitHub settings/API evidence for `release-protected`
