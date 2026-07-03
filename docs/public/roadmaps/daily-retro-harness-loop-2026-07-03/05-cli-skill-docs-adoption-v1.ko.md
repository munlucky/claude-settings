# Phase 05 - CLI, Skill, Docs, Package Adoption Prep

## Objective

Retro command surface를 public CLI와 agent skill/docs에 연결하고, package/runtime payload 경계를 검증한다.

## Surface Classification

- `source_only`: CLI dispatch, scripts, docs, skill files, tests.
- `package_runtime_payload`: package materialization must include source commands and exclude generated retro runtime state.
- `installed_profile_or_account_root`: deferred; no live install mutation in this phase.

## Owned Paths

```text
bin/moonshot-relay.mjs
package.json
skills/moonshot-retro/SKILL.md
skills/moonshot-retro/SKILL.ko.md
README.md
docs/public/reference/runtime-skill-surface.md
package/package-contract.yaml
tests/retro-cli-contract.test.mjs
tests/package-layout.test.mjs
tests/package-materialization.test.mjs
```

## Required Behavior

- `node bin/moonshot-relay.mjs retro --help` succeeds.
- existing `install`, `bridge`, and `delivery submit` behavior remains unchanged.
- `npm run test:retro` exists.
- retro tests are included in `npm test`.
- package payload includes `tools/retro`, `schemas/retro.*`, `templates/retro`, docs, and skill files.
- generated retro state is excluded from package payload.

## Acceptance Criteria

- CLI routing test passes.
- package tests prove source files are included and runtime output is excluded.
- public docs explain collect/import/daily/propose/issue-draft flow.
- skill docs explicitly state that `--apply`/remote writes require human approval and are out of initial scope.

## Verification

```bash
node bin/moonshot-relay.mjs retro --help
npm run test:retro
npm test
node package/build-package.mjs --runtime all --dry-run --json
node scripts/install-account-root-harness.mjs --runtime all --dry-run --json
```

## Deferred Closeout

After source implementation passes, a separate controlled adoption closeout may sync account-root installed profiles and verify installed parity. Do not imply that this source phase completes installed runtime adoption.

