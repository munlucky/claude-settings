# Phase 05: Runtime Skill Surface (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-5 | Harness surface plan | Reduce runtime profile skill discovery surface | Adds manifest, package materialization, installer pruning, and tests |

## Goal

Expose only five supported public skills in Claude/Codex runtime profile discovery while preserving all canonical internal skills in the common Moonshot Relay payload.

## Expected Outcome

Materialized service profiles contain exactly `product-orchestrator`, `moonshot-orchestrator`, `moonshot-phase-runner`, `commit-moonshot`, and `session-logger` under `skills/`; internal and optional skills remain available as common payload contracts, not public discovery entries.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: wave-4
  dependsOn:
    - 01-legacy-archive-contract-split-v1
    - 04-completion-verifier-surface-v1
  conflictsWith: []
  ownedPaths:
    - package/runtime-surface.json
    - package/build-package.mjs
    - package/package-contract.yaml
    - scripts/install-account-root-harness.mjs
    - tests/package-materialization.test.mjs
    - tests/package-layout.test.mjs
    - tests/plugin-manifest.test.mjs
    - .codex-plugin/plugin.json
    - .claude-plugin/plugin.json
    - README.md
    - package/README.md
    - docs/public/repository-layout.md
    - docs/public/installer-usage.md
  readOnlyPaths:
    - skills/**
    - archive/**
    - package/claude/profile/**
    - package/codex/profile/**
    - package/moonshot-relay/profile/**
    - .claude/**
    - .codex/**
    - .moonshot-state/**
    - C:/Users/moon/.claude/**
    - C:/Users/moon/.codex/**
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: disjoint_patch
```

## Scope

- In scope:
  - Add a single runtime surface manifest.
  - Materialize public allowlist only into service profile discovery `skills/`.
  - Materialize full canonical skills into common non-discovery payload.
  - Prune only previously managed stale internal skill dirs in temp-home installer tests.
- Out of scope:
  - Deleting canonical skills.
  - Replacing entire `.claude/skills` or `.codex/skills` directories.
  - Mutating live account roots.
  - Redesigning `npx skills add` source catalog behavior.

## Preconditions and Inputs

- Required docs:
  - `00-master-plan-v1.md`
  - `04-completion-verifier-surface-v1.md`
- Required code/data:
  - Current package materialization tests that expect broad skill exposure.
  - Existing account-root installer merge/preservation logic.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add runtime surface manifest | Create `package/runtime-surface.json` with public skill allowlist, utility allowlist, bootstrap note, and common internal skill policy | Tests read or verify one manifest |
| P05-2 | Add RED package tests | Update tests to expect five service profile skills and full common payload skills | Current broad exposure fails |
| P05-3 | Update package builder | Copy full `skills/**` to common payload; copy allowlisted skills only to Claude/Codex profiles | Dry-run planned copies prove separation |
| P05-4 | Update installer pruning | Use previous manifest ownership to prune managed skills no longer in allowlist; preserve external user skills | Temp-home smoke proves safe pruning |
| P05-5 | Align plugin/docs | Update plugin manifests, package contract, README, package README, repository layout, installer usage | Docs and manifests name same allowlist |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Runtime profile discovery shows only five skills | `node --test tests/package-materialization.test.mjs tests/package-layout.test.mjs tests/plugin-manifest.test.mjs` | Pass | test output |
| SCN-05-2 | Internal skill contracts are still packaged outside discovery | `node package/build-package.mjs --runtime all --dry-run --json` | Planned common payload includes internal skills | dry-run JSON |
| SCN-05-3 | Installer removes stale managed internal skills but preserves external skills | temp-home installer smoke | Pass | test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | `package/runtime-surface.json` | package contract/docs/tests | package tests | `node --test tests/package-materialization.test.mjs tests/package-layout.test.mjs tests/plugin-manifest.test.mjs` | RED current broad profile, GREEN allowlist |
| P05-2 | none | `package/build-package.mjs`, installer, plugin manifests | package and installer tests | `npm run test:package` | Profiles exact five, common full skills |

## Blockers And Review

- Blocker condition: Any change deletes canonical internal skill files.
- First review checkpoint: After RED tests and manifest creation.
- Re-review trigger: Installer pruning touches unowned/external skills in temp-home smoke.
- Verification evidence path: package dry-run JSON and temp-home installer smoke output.

## Validation Plan

- [ ] Package surface tests: `node --test tests/package-materialization.test.mjs tests/package-layout.test.mjs tests/plugin-manifest.test.mjs`
- [ ] Package gate: `npm run test:package`
- [ ] Full active gate: `npm test`
- [ ] Dry-run package: `node package/build-package.mjs --runtime all --dry-run --json`
- [ ] Dry-run installer: `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- [ ] Temp-home installer smoke with seeded external and stale managed internal skill directories
- [ ] Hygiene: `git diff --check`

## Evidence to Mark Done

- Service profile skill dirs exactly equal the five public names.
- Common payload contains internal examples such as `moonshot-plan-writer`, `completion-verifier`, and `verification-contract-gate`.
- Plugin manifests and package contract reference the same runtime surface manifest.
- Temp-home smoke proves external skills are preserved and managed stale internal skills are pruned.
- No live account-root paths are mutated during validation.

## Deliverables

- Runtime surface manifest.
- Package builder and installer exposure logic.
- Tests protecting public discovery allowlist and internal contract preservation.
- Updated docs and plugin manifests.

## Phase Completion Checklist

- [ ] Runtime surface manifest added
- [ ] RED/GREEN package exposure tests added
- [ ] Common full skills and service allowlist implemented
- [ ] Temp-home safe pruning tested
- [ ] Package/full gates pass

## Handoff Notes

This phase is intentionally last. If it uncovers that public orchestrators depend on slash-skill discovery for internal stage owners, stop and record a blocker instead of widening the public allowlist.
