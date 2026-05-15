# Phase 02 - Canonical Layout And Package Contract

## Objective

Create the target source/package boundary so future changes happen in canonical paths instead of inside `.claude/`.

## Target Decisions

Use this layout unless Phase 01 discovers a blocker:

```text
skills/
agents/
rules/
scripts/
schemas/
templates/
tests/
package/
  claude/profile/
  codex/profile/
.claude-plugin/
.codex-plugin/
.claude/
```

## Deliverables

- Root-level canonical directories with README stubs where needed.
- `package/README.md` explaining generated or curated runtime payloads.
- `docs/public/repository-layout.md` describing source, wrapper, and state boundaries.
- A package contract file, for example `package/package-contract.yaml`, listing required payload entries for Claude and Codex.

## Migration Policy

- Prefer move-with-wrapper over big-bang path replacement.
- Keep `.claude/...` compatibility wrappers until Phase 06.
- Do not duplicate long-lived source manually between `.claude/` and root directories.
- If symlinks are used, installer behavior on Windows must be tested or avoided.
- If generated copies are used, add a materialization test that detects drift.

## Acceptance Criteria

- The canonical location for each source class from Phase 01 is declared.
- The package contract lists required skills, agents, rules, scripts, schemas, templates, docs, and verification contract files.
- The contract explicitly excludes logs, caches, traces, browser artifacts, sqlite state, memorygraph data, and verdict outputs.
- Contributors can tell where to add a new skill or script without touching generated `.claude/` output.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P02"
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn: ["P01"]
  conflictsWith: ["P03", "P04", "P05", "P06"]
  ownedPaths:
    - "skills/**"
    - "agents/**"
    - "rules/**"
    - "scripts/**"
    - "schemas/**"
    - "templates/**"
    - "tests/package-layout.test.mjs"
    - "package/README.md"
    - "package/package-contract.yaml"
    - "docs/public/repository-layout.md"
  readOnlyPaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/**"
    - ".claude/**"
    - "README.md"
    - "AGENTS.md"
    - "install-claude.sh"
    - "install-claude.ps1"
  sharedMutablePaths:
    - "tests/package-materialization.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
  allowedMutationType: "canonical_layout_and_contract"
  blockedPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/**"
    - ".claude/cache/**"
    - ".claude/traces/**"
    - ".claude/browser-artifacts/**"
    - ".claude/browser-runtime/**"
    - ".claude/memorygraph/**"
    - ".claude/runtime-state.sqlite*"
  rollbackRule: "Remove newly introduced canonical directories and package contract files only if no later phase has consumed them; otherwise revert through compatibility wrappers in P06."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p02-package-layout-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p02-contract-review.md"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p02-git-diff-check.txt"
  completionCondition: "Canonical source directories and package contract exist, no long-lived duplicate source policy is introduced, and package layout tests pass."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P02-T01 | AC-01 | Generate or move into `skills/`, `agents/`, `rules/`, `scripts/`, `schemas/`, `templates/`; add README stubs only where needed. | `node --test tests/package-layout.test.mjs` | Test reports canonical directories exist and `.claude/` is not canonical source. | Duplicate long-lived source exists in both root and `.claude/` without wrapper/generation policy. | Reviewer compares source classes from `inventory/path-boundary-map.yaml` to target locations. | `evidence/p02-package-layout-test.txt` |
| P02-T02 | AC-01, AC-02, AC-03, AC-07 | Generate `package/package-contract.yaml` and `package/README.md`. | `node --test tests/package-layout.test.mjs` | Contract lists required payload entries and excludes every generated-state class. | Missing package-contract entry for skills, agents, rules, scripts, schemas, templates, docs, or verification contract. | Reviewer checks contract against P01 inventory and Target Decisions. | `evidence/p02-contract-review.md` |
| P02-T03 | AC-06 | Generate `docs/public/repository-layout.md`. | `rg -n "canonical source|development profile|generated state|package payload" docs/public/repository-layout.md package/README.md` | Documentation names the source, wrapper, state, and payload boundaries. | Contributors cannot identify where a new skill or script belongs. | Reviewer checks docs are contributor-facing and do not call `.claude/` canonical source. | `evidence/p02-layout-doc-rg.txt` |
| P02-T04 | AC-01, AC-03 | Edit `tests/package-layout.test.mjs`; optionally extend `tests/package-materialization.test.mjs`. | `git diff --check` | Exit 0. | Unsupported symlink behavior is required for Windows installers or package tests cannot validate drift. | Reviewer confirms symlinks are avoided or explicitly tested on Windows. | `evidence/p02-git-diff-check.txt` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P02-SCN-01 | A contributor adds a new skill under `skills/` without editing `.claude/skills` as source. | `tests/package-layout.test.mjs` covers canonical skill location. | `evidence/p02-package-layout-test.txt` |
| P02-SCN-02 | Package generation knows exactly what to include and exclude. | `package/package-contract.yaml` includes required payload and generated-state exclusion sections. | `evidence/p02-contract-review.md` |
| P02-SCN-03 | Windows-safe materialization is a design constraint before installer work starts. | Contract avoids unsupported symlink dependency or marks Windows validation as required. | `package/package-contract.yaml` |

## Verification

```bash
node --test tests/package-layout.test.mjs
git diff --check
```
