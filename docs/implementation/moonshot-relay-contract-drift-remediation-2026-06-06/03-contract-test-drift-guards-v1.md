# Phase 03 - Contract Test Drift Guards v1

## Objective

Strengthen active contract tests so they catch profile-local guideline drift, archive specimen leakage into the active gate, and inconsistent document path defaults.

## Phase Execution Metadata

```yaml
phase: 03
dependsOn: [01]
ownedPaths:
  - tests/active-contracts.test.mjs
  - tests/package-layout.test.mjs
  - tests/harness-regression-contract.test.mjs
  - package.json
  - package/profile-templates/claude/.claude/CLAUDE.md
  - package/profile-templates/claude/.claude/PROJECT.md
  - package/profile-templates/codex/.codex/AGENTS.md
  - schemas/analysis-context.schema.yaml
  - schemas/verification.contract.yaml
readOnlyPaths:
  - docs/public/guidelines/code-review-graph-workflow.md
  - docs/public/runtime-state-cleanup.md
  - README.md
liveMutationPolicy: generated profile output may be regenerated only for verification and remains untracked
```

## Issue C1 - Guideline Regex Blind Spot

| Loop | Result |
|------|--------|
| Improvement v1 | Expand regex to catch `.claude/docs/guidelines` without trailing slash. |
| Review 1 | This may catch valid deprecated-path explanations in docs. |
| Improvement v2 | Limit hard ban to active instruction surfaces and separate docs/public deprecated examples. |
| Review 2 | Allowlist creep can weaken the guard. |
| Final v3 | Add a named `PROFILE_LOCAL_GUIDELINE_REF` scanner. Ban it in active instruction files; allow docs/public only in explicit deprecated-path explanation sections. |

## Issue C2 - Profile Template guidelinesRoot

| Loop | Result |
|------|--------|
| Improvement v1 | Replace profile template `guidelinesRoot` with `docs/public/guidelines`. |
| Review 1 | `documentPaths` mixes runtime task paths and source guideline paths. |
| Improvement v2 | Split guideline source from runtime document roots. |
| Review 2 | Key rename may have broad schema blast radius. |
| Final v3 | Keep scope narrow: change `guidelinesRoot` value or add `canonicalGuidelinesRoot` without breaking existing task path consumers; test materialization. |

## Issue C3 - Archive Specimen in npm test

| Loop | Result |
|------|--------|
| Improvement v1 | Remove archive-spawning tests from active suite. |
| Review 1 | Legacy compatibility regression would disappear. |
| Improvement v2 | Move archive specimen to explicit `test:legacy-archive`. |
| Review 2 | Both `active-contracts` and `harness-regression-contract` spawn archive executables. |
| Final v3 | Create/retain explicit legacy archive suite outside default `npm test`, and assert default test script does not transitively run archive executables unless a documented exception remains. |

## Issue C4 - documentPaths Split

| Loop | Result |
|------|--------|
| Improvement v1 | Make every `tasksRoot` `.moonshot-relay/docs/tasks`. |
| Review 1 | `docs/claude-tasks` is tracked planning archive, not generated runtime state. |
| Improvement v2 | Name roles: tracked planning docs, generated runtime task state, deprecated `.claude` compatibility. |
| Review 2 | Machine-readable defaults must still be consistent. |
| Final v3 | Set profile template runtime `tasksRoot` to `.moonshot-relay/docs/tasks`, keep `docs/claude-tasks` as tracked planning archive text, and ban new `.claude/docs/tasks` defaults. |

## Acceptance Criteria

- Active contract tests fail on `guidelinesRoot: ".claude/docs/guidelines"`.
- Profile templates no longer default guidelines to `.claude/docs/guidelines`.
- `npm test` is the active gate; legacy archive tests run only through explicit script or documented compatibility exception.
- Runtime task root defaults and tracked planning docs are clearly separated.

## Verification

- `npm test`
- `npm run test:legacy-archive` if introduced
- `node --test tests/active-contracts.test.mjs tests/package-layout.test.mjs`
- `node package/build-package.mjs --runtime all --dry-run --json`

## Risks

- CI may use bare `node --test` and still discover legacy tests. CI command surface must be checked before moving tests.
