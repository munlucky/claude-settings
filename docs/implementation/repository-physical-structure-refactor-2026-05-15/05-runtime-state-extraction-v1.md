# Phase 05 - Runtime State Extraction

## Objective

Move or quarantine generated runtime state so the public repository and package payloads contain source and fixtures only.

## Current State Classes

Generated state currently appears in or near:

- `.claude/logs/`
- `.claude/cache/`
- `.claude/traces/`
- `.claude/browser-artifacts/`
- `.claude/browser-runtime/`
- `.claude/memorygraph/`
- `.claude/runtime-state.sqlite*`
- `.claude/*verdict*.json`
- `.claude/knowledge-repo-audit-*.json`
- `.claude/memory.json`
- `.code-review-graph/`

## Target State Policy

Selected target for execution:

```text
.moonshot-state/
├── logs/
├── cache/
├── traces/
├── browser-artifacts/
├── memorygraph/
└── runtime-state.sqlite
```

Fallback target if runtime compatibility requires `.claude`:

```text
.claude/state/
```

The fallback is allowed only with an explicit compatibility note and strict package exclusion tests.

## Deliverables

- State-root config constant or resolver in harness scripts.
- Updated `.gitignore` entries for the selected state root.
- Migration audit that detects old state paths and reports cleanup instructions.
- Tests proving package materialization excludes state roots.

## Acceptance Criteria

- New runtime writes go to the selected ignored state root or through a resolver that can be configured.
- Existing `.claude` state paths remain readable through compatibility fallback until cleanup.
- Package payload generation excludes all generated state classes.
- Docs explain how to clean local state without deleting canonical source.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P05"
  parallelEligible: true
  parallelGroup: "wave-3-state"
  dependsOn: ["P01", "P02"]
  conflictsWith: ["P04", "P06"]
  ownedPaths:
    - ".gitignore"
    - ".moonshot-state/**"
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/memorygraph-mcp-wrapper.js"
    - ".claude/scripts/code-review-graph-mcp-wrapper.js"
    - ".claude/scripts/codex-mcp-singleton.mjs"
    - ".claude/scripts/lib/phase-event-ledger.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/runtime-unavailable-cache.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - "tests/package-materialization.test.mjs"
    - "tests/migration-audit.test.mjs"
    - "docs/public/runtime-state-cleanup.md"
  readOnlyPaths:
    - "package/package-contract.yaml"
    - "package/claude/profile/**"
    - "package/codex/profile/**"
    - "install-claude.sh"
    - "install-claude.ps1"
    - "README.md"
    - ".claude/README.md"
  sharedMutablePaths:
    - "tests/package-materialization.test.mjs"
    - "tests/migration-audit.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "coordinated_patch"
  allowedMutationType: "runtime_state_policy_and_resolver"
  blockedPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/docs/tasks/**"
    - ".claude/docs/reports/**"
    - ".claude/logs/**"
    - ".claude/cache/**"
    - ".claude/traces/**"
    - ".claude/browser-artifacts/**"
    - ".claude/browser-runtime/**"
    - ".claude/memorygraph/**"
    - ".claude/runtime-state.sqlite*"
    - ".claude/*verdict*.json"
  rollbackRule: "Restore old default state paths in resolver files and `.gitignore`; do not delete existing runtime state, only document cleanup."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p05-state-root-decision.md"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p05-package-state-exclusion-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p05-migration-audit-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p05-cleanup-guide-review.md"
  completionCondition: "`.moonshot-state/` is the default ignored state root, old `.claude` state remains readable through compatibility fallback, package tests exclude state, and cleanup docs are present."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P05-T01 | AC-03 | Edit `.gitignore`; document selected `.moonshot-state/` root. | `rg -n "\\.moonshot-state|\\.claude/(logs|cache|traces|browser-artifacts|browser-runtime|memorygraph|runtime-state\\.sqlite)" .gitignore docs/public/runtime-state-cleanup.md` | `.moonshot-state/` and legacy generated-state paths are ignored or documented for cleanup. | State root decision is reopened or fallback `.claude/state/` is used without compatibility note. | Reviewer confirms `.moonshot-state/` is the selected default. | `evidence/p05-state-root-decision.md` |
| P05-T02 | AC-03, AC-05 | Edit state resolver files: `.claude/scripts/runtime-state.mjs`, `.claude/scripts/memorygraph-mcp-wrapper.js`, `.claude/scripts/code-review-graph-mcp-wrapper.js`, `.claude/scripts/codex-mcp-singleton.mjs`, `.claude/scripts/lib/phase-event-ledger.mjs`, `.claude/scripts/lib/phase-run-lease-store.mjs`, `.claude/scripts/lib/runtime-unavailable-cache.mjs`, `.claude/scripts/lib/harness-state-invariants.mjs`. | `node --test tests/migration-audit.test.mjs` | Audit reports old state paths, new `.moonshot-state/` resolver behavior, and cleanup guidance. | Runtime writes still default to `.claude/logs`, `.claude/cache`, `.claude/traces`, `.claude/memorygraph`, or `.claude/runtime-state.sqlite*` without resolver fallback. | Reviewer checks each resolver has configurable root and backward-readable legacy path. | `evidence/p05-migration-audit-test.txt` |
| P05-T03 | AC-03, AC-07 | Edit `tests/package-materialization.test.mjs`. | `node --test tests/package-materialization.test.mjs --test-name-pattern "excludes runtime state"` | Test rejects `.moonshot-state/`, `.claude/state/`, legacy state paths, verdict JSON, and `.code-review-graph/` from package payloads. | Generated state appears in `package/claude/profile` or `package/codex/profile`. | Reviewer checks exclusion list matches P01 denylist. | `evidence/p05-package-state-exclusion-test.txt` |
| P05-T04 | AC-06 | Generate `docs/public/runtime-state-cleanup.md`. | `git diff --check` | Exit 0. | Cleanup instructions risk deleting canonical source or active `.claude/docs/phase-status.yaml`. | Reviewer verifies cleanup guide separates local state from source/profile files. | `evidence/p05-cleanup-guide-review.md`, `evidence/p05-git-diff-check.txt` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P05-SCN-01 | New runtime state is written under `.moonshot-state/` instead of distributable source/profile paths. | Migration audit test proves resolver defaults. | `evidence/p05-migration-audit-test.txt` |
| P05-SCN-02 | Existing local `.claude` state can still be read during the compatibility window. | Resolver tests cover legacy fallback reads without package inclusion. | `evidence/p05-migration-audit-test.txt` |
| P05-SCN-03 | A contributor can clean state without deleting skills, scripts, rules, schemas, or templates. | Cleanup guide review confirms delete targets are state-only. | `evidence/p05-cleanup-guide-review.md` |

## Verification

```bash
node --test tests/package-materialization.test.mjs --test-name-pattern "excludes runtime state"
node --test tests/migration-audit.test.mjs
git diff --check
```
