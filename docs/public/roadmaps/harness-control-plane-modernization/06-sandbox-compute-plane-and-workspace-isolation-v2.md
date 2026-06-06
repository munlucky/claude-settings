# Phase 06 - Sandbox Compute Plane and Workspace Isolation v2

## Goal

Separate disposable compute execution from authoritative state and protect source, profile, account-root, and generated-state boundaries.

## Execution Metadata

- Dependencies: Phase 02, Phase 03, Phase 05.
- Owned paths: `tools/sandbox/**`, `scripts/lib/runtime-state-store.mjs`, `rules/security.md`, `rules/workflow.md`, `skills/workspace-isolation-gate/SKILL.md`, `skills/moonshot-phase-runner/SKILL.md`, `skills/moonshot-orchestrator/SKILL.md`, `skills/completion-verifier/SKILL.md`, `tests/tool-sandbox-eval-contract.test.mjs`, `tests/workflow-e2e-contract.test.mjs`.
- Read-only paths: live account-root homes, generated state roots, browser artifacts outside sandbox artifact collection.
- Adoption targets: source sandbox policy first, temp leased worktree smoke second, live adoption only in later rollout phase.
- Live mutation policy: live account-root install/sync is forbidden in this phase.
- Required evidence: out-of-scope write fixture, unapproved dependency/network/external write blocker fixture, leased worktree cleanup fixture, package exclusion fixture.
- Conflicts: direct live account-root writes, protected path mutation, generated-state source promotion, sandbox artifact package inclusion.
- Staged paths: sandbox tools, security/workflow rules, affected skill policy docs, sandbox tests.
- Closure traceability: approval blocker events, protected path fixture output, sandbox cleanup output.

## Required Work

- Define leased worktree lifecycle for implementation attempts.
- Enforce protected paths for `.claude/**`, `.codex/**`, `.moonshot-relay/**`, `.moonshot-state/**`, runtime DBs, traces, caches, and account-root homes.
- Classify destructive file operation, dependency install, network access, external write, account-root install/sync, and generated-state promotion as approval-required.
- Record unauthorized approval-required attempts as blocking runtime events.
- Add shell/browser isolation policy and artifact collection.
- Update `workspace-isolation-gate`, `moonshot-phase-runner`, `moonshot-orchestrator`, and `completion-verifier` policy text.

## Acceptance Criteria

- Out-of-scope writes are blocked or recorded as blocking facts.
- Unauthorized approval-required operations prevent accepted completion.
- Sandbox artifacts are collected as evidence without entering package payload.
- Leased compute state can be discarded without losing authoritative evidence.

## Regression Contract

- Protected path writes are blocked or recorded as blocking runtime events.
- Destructive file operation, dependency install, network access, external write, account-root install/sync, and generated-state promotion require approval.
- Unauthorized approval-required operations block accepted completion.
- Sandbox artifacts are excluded from package payload.
- Lease cleanup leaves source authority intact.

## Completion Evidence

- `npm test`
- Out-of-scope write fixture
- Approval-required blocker fixture
- Sandbox artifact/package-exclusion fixture
- Leased worktree cleanup fixture
