# Phase 04 - Installer And Plugin Materialization

## Objective

Update script-based installers and plugin manifests so downstream users receive a stable runtime payload generated from canonical source, not from this repository's development `.claude/` profile.

## Surfaces

- `install-claude.sh`
- `install-claude.ps1`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/plugin.json`
- any generated `package/claude/profile` and `package/codex/profile` payloads

## Target Behavior

- `install-claude.*` copies or materializes from canonical source/package payloads.
- Plugin manifests point at canonical `skills/` or generated package payloads.
- Downstream install still creates `.claude/` where the target runtime expects it.
- Dry-run mode reports every target file and every excluded generated-state path.
- Existing `PROJECT.md` and user-local files remain protected.

## Acceptance Criteria

- Dry-run install works without reading canonical source from `.claude/skills`, `.claude/scripts`, or `.claude/templates`.
- Plugin manifests are valid JSON and refer to existing paths.
- Runtime payloads include required compatibility files for Claude and Codex.
- Install output excludes generated state and local-only dev files.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P04"
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn: ["P02", "P03"]
  conflictsWith: ["P05", "P06"]
  ownedPaths:
    - "install-claude.sh"
    - "install-claude.ps1"
    - ".claude-plugin/plugin.json"
    - ".claude-plugin/marketplace.json"
    - ".codex-plugin/plugin.json"
    - ".codex-plugin/marketplace.json"
    - "package/claude/profile/**"
    - "package/codex/profile/**"
    - "tests/plugin-manifest.test.mjs"
    - "tests/package-materialization.test.mjs"
  readOnlyPaths:
    - "package/package-contract.yaml"
    - "skills/**"
    - "agents/**"
    - "rules/**"
    - "scripts/**"
    - "schemas/**"
    - "templates/**"
    - ".claude/README.md"
    - ".claude/CLAUDE.md"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/**"
  sharedMutablePaths:
    - "tests/package-materialization.test.mjs"
  requiresManualEvidence: true
  mergePolicy: "sequential_patch"
  allowedMutationType: "installer_plugin_and_package_materialization"
  blockedPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/**"
    - ".claude/cache/**"
    - ".claude/traces/**"
    - ".claude/browser-artifacts/**"
    - ".claude/browser-runtime/**"
    - ".claude/memorygraph/**"
    - ".claude/runtime-state.sqlite*"
    - "package/**/.local/**"
  rollbackRule: "Revert installer, plugin manifest, and generated package payload changes together; do not remove canonical source created by P02."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p04-install-sh-dry-run.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p04-install-ps1-dry-run.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p04-plugin-manifest-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p04-package-materialization-test.txt"
  completionCondition: "Shell and PowerShell dry-runs report stable downstream payloads, plugin manifests validate as JSON with existing paths, and package materialization excludes generated state."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P04-T01 | AC-04 | Edit `install-claude.sh` and `install-claude.ps1` to materialize from canonical/package sources. | `bash install-claude.sh --dry-run` and `.\install-claude.ps1 -DryRun` | Dry-run lists target `.claude/` payload and excluded state paths without reading source from `.claude/skills`, `.claude/scripts`, or `.claude/templates`. | Downstream overwrite risk for existing `PROJECT.md` or user-local files; Windows dry-run unavailable. | Reviewer checks dry-run output for copy source and overwrite protections. | `evidence/p04-install-sh-dry-run.txt`, `evidence/p04-install-ps1-dry-run.txt` |
| P04-T02 | AC-02 | Edit `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.codex-plugin/marketplace.json`. | `node --test tests/plugin-manifest.test.mjs` | Manifest JSON parses and every path exists under canonical or package payload roots. | Invalid JSON, missing manifest path, or manifest points at `.claude/` as canonical source. | Reviewer checks manifest path intent against `package/package-contract.yaml`. | `evidence/p04-plugin-manifest-test.txt` |
| P04-T03 | AC-03, AC-07 | Generate `package/claude/profile/**`, `package/codex/profile/**`; edit `tests/package-materialization.test.mjs`. | `node --test tests/package-materialization.test.mjs` | Payload includes required skills/rules/scripts/schemas/templates/docs and excludes runtime state/local-only dev files. | Package includes logs/cache/traces/browser artifacts/sqlite/memorygraph/verdicts or omits required compatibility files. | Reviewer compares package entries to contract required/excluded lists. | `evidence/p04-package-materialization-test.txt` |
| P04-T04 | AC-02, AC-04 | No extra source edits. | `git diff --check` | Exit 0. | Whitespace errors or installer/plugin changes diverge between shell and PowerShell behavior. | Reviewer checks shell and PowerShell dry-run parity notes. | `evidence/p04-git-diff-check.txt` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P04-SCN-01 | A downstream user still receives a `.claude/` runtime payload from `install-claude.*`. | Shell and PowerShell dry-run outputs list equivalent target payloads. | `evidence/p04-install-sh-dry-run.txt`, `evidence/p04-install-ps1-dry-run.txt` |
| P04-SCN-02 | Claude and Codex plugin manifests do not depend on this repository's dev `.claude/` as source. | Plugin manifest test validates existing canonical/package paths. | `evidence/p04-plugin-manifest-test.txt` |
| P04-SCN-03 | Package output is source-plus-wrappers only, not runtime state. | Materialization test excludes generated-state classes. | `evidence/p04-package-materialization-test.txt` |

## Verification

```bash
bash install-claude.sh --dry-run
node --test tests/plugin-manifest.test.mjs
node --test tests/package-materialization.test.mjs
git diff --check
```

Windows validation:

```powershell
.\install-claude.ps1 -DryRun
```

## Follow-up TODOs

| ID | Status | Runtime | Command | Notes |
| --- | --- | --- | --- | --- |
| P04-WIN-DRYRUN | todo | Windows / PowerShell | `.\install-claude.ps1 -DryRun` | Phase 04 accepted as passed on 2026-05-15 from macOS/Codex evidence. Replace `evidence/p04-install-ps1-dry-run.txt` with passing Windows evidence when available. |
