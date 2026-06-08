# Phase 05 - Runtime Skill Package Surface v1

## Purpose

Make `package/runtime-surface.json` the single authority for profile-local runtime skill discovery and preserve the 6 public runtime skills, including `moonshot-plan-writer`.

## Execution Metadata

```yaml
phase: 05
title: Runtime Skill Package Surface
dependsOn:
  - 04-prompt-gate-surface-v1
conflictsWith:
  - docs/implementation/harness-surface-simplification-2026-06-08/05-runtime-skill-surface-v1.md
ownedPaths:
  - package/runtime-surface.json
  - package/package-contract.yaml
  - package/build-package.mjs
  - scripts/install-account-root-harness.mjs
  - tests/package-materialization.test.mjs
  - tests/package-layout.test.mjs
  - tests/plugin-manifest.test.mjs
  - .claude-plugin/plugin.json
  - .codex-plugin/plugin.json
  - README.md
  - package/README.md
  - docs/public/installer-usage.md
  - docs/public/repository-layout.md
  - docs/public/reference/runtime-skill-surface.md
readOnlyPaths:
  - skills/**
  - archive/**
  - .claude/**
  - .codex/**
  - C:/Users/moon/.claude/**
  - C:/Users/moon/.codex/**
sharedMutablePaths:
  - tests/package-layout.test.mjs
  - tests/package-materialization.test.mjs
  - docs/public/repository-layout.md
adoptionTargets:
  - package/runtime-surface.json
  - package dry-run payload
  - installer dry-run payload
liveMutationPolicy: dry_run_and_temp_home_only
```

## Implementation Contract

`package/runtime-surface.json` is the single authority for the public runtime allowlist.

`publicRuntimeSkills` must be exactly:

- `product-orchestrator`
- `moonshot-orchestrator`
- `moonshot-phase-runner`
- `commit-moonshot`
- `session-logger`

`moonshot-plan-writer` must remain in profile-local public runtime discovery because users invoke it directly for plan package creation.

Update:

- `package/package-contract.yaml`
- `README.md`
- `package/README.md`
- `docs/public/installer-usage.md`
- `docs/public/repository-layout.md`
- `docs/public/reference/runtime-skill-surface.md`

Test refactor:

- `tests/package-materialization.test.mjs` reads expected public skills from `package/runtime-surface.json`.
- `tests/plugin-manifest.test.mjs` reads expected public skills from `package/runtime-surface.json`.
- `tests/package-layout.test.mjs` compares package contract public skills to `package/runtime-surface.json`.

Profile/package behavior:

- Claude/Codex profile payloads include the 6 public skills.
- Common payload includes `skills/moonshot-plan-writer/SKILL.md`.
- Plugin manifests refer to `package/runtime-surface.json` and do not own a divergent 6-skill allowlist.
- `.claude-plugin/marketplace.json` and `.codex-plugin/marketplace.json` remain unchanged unless they contain their own skill allowlist.

## Acceptance Criteria

- `moonshot-plan-writer` remains present in profile-local public discovery.
- `moonshot-plan-writer` also remains available in common/internal payload.
- Public docs describe 6 public runtime skills.
- No hardcoded test allowlist drifts from `package/runtime-surface.json`.
- Live account-root is not mutated.

## Verification

```powershell
node --test tests/package-materialization.test.mjs tests/package-layout.test.mjs tests/plugin-manifest.test.mjs
node package/build-package.mjs --runtime all --dry-run --json
node scripts/install-account-root-harness.mjs --runtime all --dry-run --json
```

If installer smoke is needed, use temp-home only.
