# Phase 01 - Source Boundary Inventory

## Objective

Classify every current `.claude/` subtree as canonical source, development-only profile, generated runtime state, package output, fixture, or deprecated history before any file movement happens.

## Scope

Inventory these path groups:

- `.claude/skills/`
- `.claude/agents/`
- `.claude/rules/`
- `.claude/scripts/`
- `.claude/schemas/`
- `.claude/templates/`
- `.claude/docs/`
- `.claude/config/`
- `.claude/tests/`
- `.claude/browser-runtime/`
- `.claude/browser-artifacts/`
- `.claude/cache/`
- `.claude/logs/`
- `.claude/traces/`
- `.claude/memorygraph/`
- `.claude/runtime-state.sqlite*`
- top-level `.claude/*verdict*.json`, `knowledge-repo-audit-*.json`, and `memory.json`

## Deliverables

- `docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/path-boundary-map.yaml`
- `docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/hard-coded-paths.md`
- `docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/runtime-artifact-denylist.md`

## Classification Rules

| Class | Meaning | Example Current Paths |
| --- | --- | --- |
| `canonical_source` | Must become root-level or package-level source. | `.claude/skills`, `.claude/agents`, `.claude/rules`, `.claude/scripts`, `.claude/schemas`, `.claude/templates` |
| `dev_profile` | Needed only for this repository's own agent runtime. | `.claude/CLAUDE.md`, selected `.claude/rules`, local bridge docs |
| `generated_state` | Must be ignored and excluded from package payloads. | `.claude/logs`, `.claude/cache`, `.claude/traces`, `.claude/runtime-state.sqlite*` |
| `fixture_or_test` | Test fixture or regression input. | `.claude/scripts/fixtures`, `.claude/tests`, selected reference plans |
| `public_doc` | Public docs that should remain under `docs/` or package docs. | selected `.claude/docs/guidelines` |
| `deprecated_history` | Kept for history but not installed by default. | `.claude/skills-archive` |

## Acceptance Criteria

- Every first-level `.claude/` path has exactly one primary class.
- Every generated-state class has a matching `.gitignore` rule or a proposed rule.
- Every hard-coded `.claude/` reference in scripts, docs, tests, skills, agents, and installers is listed with a migration decision.
- No files are moved in this phase.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P01"
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: ["P02", "P03", "P04", "P05", "P06"]
  ownedPaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/path-boundary-map.yaml"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/hard-coded-paths.md"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/runtime-artifact-denylist.md"
  readOnlyPaths:
    - ".claude/**"
    - ".gitignore"
    - "README.md"
    - "AGENTS.md"
    - "docs/**"
    - "install-claude.sh"
    - "install-claude.ps1"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "inventory_only"
  allowedMutationType: "planning_inventory_only"
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
  rollbackRule: "Delete only the three P01 inventory files; no source/runtime files may be changed."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p01-find-claude-dirs.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p01-hard-coded-path-rg.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p01-git-diff-check.txt"
  completionCondition: "Inventory files classify every first-level `.claude/` path, list every generated-state ignore decision, and list every hard-coded `.claude/` reference with a migration decision."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01-T01 | AC-01, AC-03 | Generate `inventory/path-boundary-map.yaml`. | `find .claude -maxdepth 2 -type d \| sort` | Output includes all first-level `.claude` directories and each has one class in the map. | Any first-level `.claude/*` directory is missing or has multiple primary classes. | Reviewer checks class names against the Classification Rules table. | `evidence/p01-find-claude-dirs.txt`, `inventory/path-boundary-map.yaml` |
| P01-T02 | AC-03, AC-05 | Generate `inventory/runtime-artifact-denylist.md`. | `rg -n "runtime-state\|memorygraph\|browser-artifacts\|traces\|logs\|cache\|verdict\|knowledge-repo-audit\|memory\\.json\|\\.code-review-graph" .gitignore README.md AGENTS.md docs .claude install-claude.sh install-claude.ps1` | Every generated-state class has an existing or proposed `.gitignore` rule. | A generated-state class lacks an ignore/proposed-ignore decision. | Reviewer checks denylist entries against package exclusion needs. | `evidence/p01-runtime-state-rg.txt`, `inventory/runtime-artifact-denylist.md` |
| P01-T03 | AC-01, AC-02, AC-04, AC-05, AC-06, AC-07 | Generate `inventory/hard-coded-paths.md`. | `rg -n "\\.claude/" README.md AGENTS.md docs .claude install-claude.sh install-claude.ps1` | Each reference is marked `canonical_source`, `installed_payload`, `dev_profile`, `runtime_state`, `compat_wrapper`, or `deprecated_history`. | Any hard-coded `.claude/` source-of-truth reference lacks a migration decision. | Reviewer samples scripts, docs, tests, skills, agents, and installers for coverage. | `evidence/p01-hard-coded-path-rg.txt`, `inventory/hard-coded-paths.md` |
| P01-T04 | AC-01, AC-03, AC-05 | No additional source edits. | `git diff --check` | Exit 0. | Whitespace errors or any source/runtime file changed in this phase. | Reviewer confirms `git status` shows only P01 inventory deliverables. | `evidence/p01-git-diff-check.txt` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P01-SCN-01 | A contributor can tell whether `.claude/skills` is source to move, profile content to keep, or generated output. | `inventory/path-boundary-map.yaml` has one primary class per first-level path. | `inventory/path-boundary-map.yaml` |
| P01-SCN-02 | Runtime artifacts are visible as non-distributable before any source movement. | Denylist covers logs, caches, traces, browser artifacts, sqlite state, memorygraph, verdicts, and audit JSON. | `inventory/runtime-artifact-denylist.md` |
| P01-SCN-03 | Hard-coded `.claude/` references do not require implementation agents to infer migration intent. | Reference inventory records a migration decision for every `rg` hit. | `inventory/hard-coded-paths.md` |

## Verification

```bash
find .claude -maxdepth 2 -type d | sort
rg -n "\\.claude/" README.md AGENTS.md docs .claude install-claude.sh install-claude.ps1
git diff --check
```
