# Moonshot Relay Remaining Contract Cleanup Master Plan v1

## Objective

Close the remaining contract drift after the 2026-06-06 remediation commits. This package covers all residual issues found by type-specific independent audits, not only the highest-priority installer breakages.

## Source Baseline

- Current branch: `main...origin/main [ahead 4]`.
- Worktree before plan writing: clean.
- Existing remediation package: `docs/implementation/moonshot-relay-contract-drift-remediation-2026-06-06/`.
- Current evidence says the active test suite can pass while residual contract drift remains in README/install guidance, active test side effects, package exclusion metadata, plugin manifest interpretation risk, and skill/agent profile-path wording.

## Residual Issue Inventory

| ID | Type | Current Symptom | Primary Phase |
|----|------|-----------------|---------------|
| R-01 | Installer/runtime docs | `README.md` still states project-local memory defaults to `.moonshot-relay/memorygraph/`. | 01 |
| R-02 | Installer/runtime docs | `README.md` template references still point at `.claude/templates/...` as if canonical. | 01 |
| R-03 | Installer/runtime docs | `README.md` presents `curl ... install-claude.sh | bash` too strongly for primary install despite Node/npx being cross-platform primary. | 01 |
| R-04 | Installer/runtime docs | `README.md` partial apply example copies a skill directly into `/your-project/.claude/skills/`. | 01 |
| R-05 | Installer/runtime docs | `install-claude.ps1` tells users to use Git Bash/WSL for `--project`, but WSL/Linux bash is unsupported by the shell installer. | 01 |
| R-06 | Installer/runtime docs | `package/profile-templates/codex/.codex/README.md` title still says `.claude Development Profile`. | 01 |
| R-07 | Contract tests | `tests/active-contracts.test.mjs` directly executes an archived legacy verifier inside the active gate. | 02 |
| R-08 | Contract tests | Browser-flow missing-runner test can write `.claude/runtime-verdict-*.json` and depends on Git Bash availability. | 02 |
| R-09 | Contract tests | Active gate does not prove clean-state/read-only behavior for verifier failure paths. | 02 |
| R-10 | Packaging | `package/package-contract.yaml` generated-state exclusion metadata is narrower than builder/tests and misses `.moonshot-state/**`. | 03 |
| R-11 | Packaging | Contract metadata does not explicitly list Codex local runtime exclusions such as `.codex/cache`, `.codex/sqlite`, `.codex/memories`, and `.codex/sessions`. | 03 |
| R-12 | Packaging | `.claude-plugin/plugin.json` has broad `scripts` entry; `entriesRole` helps but a legacy plugin consumer may still wholesale-copy source scripts. | 03 |
| R-13 | Packaging | Dry-run generated payload denylist may be prefix/glob ambiguous and can create false positives such as `scripts/verification-verdict-state.mjs`. | 03 |
| R-14 | Skill/agent guidance | Several skills/agents still reference `.claude/skills` or `.claude/agents` in wording that can read as canonical source. | 04 |
| R-15 | Skill/agent guidance | Active tests do not comprehensively block new source-like `.claude/skills` and `.claude/agents` references. | 04 |
| R-16 | Public docs | Public guideline files are short policy anchors; decide whether this package asserts anchor status or expands operational depth. | 05 |
| R-17 | Public docs/tests | README stale memory/template/install drift is not strongly covered by contract tests. | 01, 02 |
| R-18 | Contract tests | Existing local runtime artifacts mean side-effect tests must compare pre/post snapshots, not assert global absence. | 02 |

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Mode |
|------|-------|-----------|------------|----------------|
| 01 | README Installer Runtime Docs | `01-readme-installer-runtime-docs-v1.md` | none | sequential |
| 02 | Active Test Side-Effect And Archive Boundary | `02-active-test-side-effect-archive-boundary-v1.md` | 01 | sequential |
| 03 | Package Contract Manifest Boundary | `03-package-contract-manifest-boundary-v1.md` | none | parallel with 01 when owned paths are disjoint |
| 04 | Skill Agent Profile Path Wording | `04-skill-agent-profile-path-wording-v1.md` | 02 | sequential |
| 05 | Public Guideline Depth Policy | `05-public-guideline-depth-policy-v1.md` | 01 | required policy classification phase for R-16 |

## Global Adoption Boundary

- Canonical source paths remain root `skills/`, `agents/`, `scripts/`, `schemas/`, `package/`, `docs/public/`, `tests/`, `templates/`, `bin/`, and installer files.
- Root `.claude/` and `.codex/` are local runtime profiles, not durable source. They are read-only unless a later controlled adoption phase explicitly targets materialized output.
- Account-root runtime state under `%USERPROFILE%\.moonshot-relay`, `%USERPROFILE%\.claude`, and `%USERPROFILE%\.codex` must not be modified during plan execution except through explicit dry-run verification.
- Generated state, logs, caches, sqlite files, MemoryGraph data, browser artifacts, verdict JSON, and generated package profile outputs are not commit payloads.

## Verification Strategy

Required final evidence after implementation:

- `npm test`
- `npm run test:package`
- `git diff --check`
- `node package/build-package.mjs --runtime all --dry-run --json`
- targeted exact-string or context-aware scans for stale README memorygraph, template, shell-installer, direct `.claude/skills` copy, source-like `.claude/skills` or `.claude/agents`, and generated-state exclusions
- targeted temp-home dry-run for account-root installer when installer docs or command guidance changes

## Plan Quality Loop

```yaml
planQualityReview:
  schemaVersion: 1
  requiredIterations: 2
  parentOwnsFinalEdits: true
  reviewerTypes:
    - readme-installer-runtime-docs
    - active-test-side-effect-archive-boundary
    - package-contract-manifest-boundary
    - skill-agent-profile-path-wording
    - public-guideline-depth-policy
  artifactRoot: docs/implementation/moonshot-relay-remaining-contract-cleanup-2026-06-06/planning-loop
  finalIteration: 3
  latestReview: docs/implementation/moonshot-relay-remaining-contract-cleanup-2026-06-06/planning-loop/plan-quality-review-iter-03.yaml
  blockingFindings: []
  currentDecision: pass
```

## Readiness Decision

`status: execution_ready`

Every phase has a type-specific review pass recorded under `planning-loop/`, all accepted review edits were applied by the parent session, and the Plan Artifact Closure Gate is the authority for final closeout.
