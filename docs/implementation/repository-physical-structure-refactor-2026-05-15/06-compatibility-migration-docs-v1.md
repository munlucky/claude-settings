# Phase 06 - Compatibility Migration And Docs

## Objective

Close the migration by updating docs, compatibility wrappers, tests, and contributor guidance so the new structure is understandable and maintainable.

## Documentation Updates

Update:

- `README.md`
- `.claude/README.md`
- `AGENTS.md` if source references change
- `docs/public/repository-layout.md`
- installer usage docs
- contributor guidance for adding skills, agents, rules, scripts, schemas, templates, and tests

## Compatibility Closeout

Keep these compatibility behaviors until a later major version:

- Downstream install still writes `.claude/` payloads.
- Existing skill docs that mention `.claude/...` either remain valid in installed payloads or point to canonical source plus generated target path.
- Scripts with `.claude/scripts/...` entrypoints keep wrappers or documented replacements.

Remove or forbid:

- treating `.claude/skills` as source of truth in this repository
- package inclusion of generated runtime state
- undocumented duplicate source directories

## Acceptance Criteria

- Public docs clearly distinguish canonical source, runtime wrapper, development profile, and generated state.
- Contributors can add or modify one skill without editing generated output.
- The migration audit reports no unresolved hard-coded source-of-truth references to `.claude/`.
- Knowledge repository audit passes after doc structure updates.
- Final verification commands pass.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P06"
  parallelEligible: false
  parallelGroup: "closeout"
  dependsOn: ["P03", "P04", "P05"]
  conflictsWith: []
  ownedPaths:
    - "README.md"
    - "AGENTS.md"
    - ".claude/README.md"
    - "docs/public/repository-layout.md"
    - "docs/public/runtime-state-cleanup.md"
    - "docs/public/installer-usage.md"
    - "docs/public/compatibility-migration.md"
    - ".claude/scripts/moonshot-phase-dispatch.sh"
    - ".claude/scripts/workflow-enforcement.sh"
    - ".claude/agents/verification/verify-changes.sh"
    - "tests/migration-audit.test.mjs"
  readOnlyPaths:
    - "package/package-contract.yaml"
    - "package/claude/profile/**"
    - "package/codex/profile/**"
    - ".claude-plugin/plugin.json"
    - ".codex-plugin/plugin.json"
    - ".gitignore"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/**"
  sharedMutablePaths:
    - "tests/migration-audit.test.mjs"
  requiresManualEvidence: true
  mergePolicy: "sequential_closeout"
  allowedMutationType: "compatibility_docs_and_final_wrappers"
  blockedPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/**"
    - ".claude/cache/**"
    - ".claude/traces/**"
    - ".claude/browser-artifacts/**"
    - ".claude/browser-runtime/**"
    - ".claude/memorygraph/**"
    - ".claude/runtime-state.sqlite*"
    - ".claude/*verdict*.json"
  rollbackRule: "Revert docs and wrapper closeout changes together; preserve compatibility wrappers until replacement commands and deprecation notes are documented."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-package-layout-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-plugin-manifest-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-package-materialization-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-migration-audit-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-install-sh-dry-run.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-knowledge-repo-audit.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-closeout-summary.md"
  completionCondition: "Docs and wrappers describe the final source/wrapper/state model, migration audit has no unresolved `.claude/` source-of-truth references, knowledge audit passes, and final verification evidence is captured."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P06-T01 | AC-06 | Edit `README.md`, `AGENTS.md`, `.claude/README.md`, `docs/public/repository-layout.md`, `docs/public/installer-usage.md`, `docs/public/compatibility-migration.md`. | `.claude/scripts/knowledge-repo-audit.sh` | Audit exits 0 and docs distinguish canonical source, runtime wrapper, dev profile, generated state, and deprecation window. | Failed knowledge audit or missing deprecation-window notes. | Reviewer checks contributor workflow for adding a skill/script without generated output edits. | `evidence/p06-knowledge-repo-audit.txt` |
| P06-T02 | AC-05, AC-07 | Edit compatibility wrappers `.claude/scripts/moonshot-phase-dispatch.sh`, `.claude/scripts/workflow-enforcement.sh`, `.claude/agents/verification/verify-changes.sh`; extend `tests/migration-audit.test.mjs`. | `node --test tests/migration-audit.test.mjs` | Audit reports no unresolved `.claude/` source-of-truth references; remaining `.claude/` references are installed payload, dev profile, runtime state fallback, or compatibility wrapper. | Any hard-coded `.claude/` source-of-truth reference remains unresolved. | Reviewer checks wrappers point to canonical script or documented installed runtime path. | `evidence/p06-migration-audit-test.txt` |
| P06-T03 | AC-01, AC-02, AC-03, AC-04, AC-07 | No new feature files beyond docs/wrappers; run final suite. | `node --test tests/package-layout.test.mjs`; `node --test tests/plugin-manifest.test.mjs`; `node --test tests/package-materialization.test.mjs`; `bash install-claude.sh --dry-run`; `git diff --check` | All commands exit 0 and dry-run output preserves downstream `.claude/` payload. | Package layout, manifest, materialization, installer dry-run, or whitespace check fails. | Reviewer confirms evidence filenames are present in closeout summary. | `evidence/p06-package-layout-test.txt`, `evidence/p06-plugin-manifest-test.txt`, `evidence/p06-package-materialization-test.txt`, `evidence/p06-install-sh-dry-run.txt`, `evidence/p06-git-diff-check.txt` |
| P06-T04 | AC-04, AC-06 | Generate `evidence/p06-closeout-summary.md`. | `rg -n "moved path summary|generated wrapper summary|compatibility window|deprecation|residual risks" docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p06-closeout-summary.md` | Closeout summary names moved paths, generated wrappers, deprecation window, installer output, plugin validation, knowledge audit, and residual risks. | Missing final closeout evidence filename or unresolved compatibility behavior. | Reviewer signs off only after all final evidence paths exist. | `evidence/p06-closeout-summary.md` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P06-SCN-01 | A new contributor can identify where to edit a skill, script, rule, schema, template, or test. | Knowledge audit and repository-layout docs pass. | `evidence/p06-knowledge-repo-audit.txt` |
| P06-SCN-02 | Existing downstream installer users keep receiving `.claude/` payloads during the compatibility window. | Installer dry-run and compatibility docs agree. | `evidence/p06-install-sh-dry-run.txt`, `docs/public/compatibility-migration.md` |
| P06-SCN-03 | No unresolved `.claude/` source-of-truth references remain. | Migration audit test passes with allowed-reference classes only. | `evidence/p06-migration-audit-test.txt` |

## Verification

```bash
node --test tests/package-layout.test.mjs
node --test tests/plugin-manifest.test.mjs
node --test tests/package-materialization.test.mjs
node --test tests/migration-audit.test.mjs
bash install-claude.sh --dry-run
.claude/scripts/knowledge-repo-audit.sh
git diff --check
```

## Closeout Evidence

Final closeout should record:

- moved path summary
- generated wrapper summary
- compatibility window and deprecation notes
- installer dry-run output location
- plugin manifest validation result
- knowledge audit result
- residual risks
