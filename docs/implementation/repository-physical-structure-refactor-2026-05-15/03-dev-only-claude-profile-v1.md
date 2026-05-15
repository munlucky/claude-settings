# Phase 03 - Dev-only `.claude` Profile

## Objective

Reduce `.claude/` to a minimal development profile for this repository while preserving current agent usability during the migration.

## Target `.claude/` Contents

Keep only:

- `.claude/CLAUDE.md`
- `.claude/PROJECT.md` if needed for repository-local development policy
- minimal `.claude/rules/` files or imports that point at canonical rules
- local `.claude/verification.contract.yaml` or a wrapper pointing at the canonical verification contract
- generated compatibility shims required during the migration window

Move or generate from canonical source:

- skills
- agents
- scripts
- schemas
- templates
- public docs
- tests

Exclude:

- logs
- cache
- traces
- sqlite runtime state
- browser artifacts
- memorygraph state
- transient verdict JSON

## Deliverables

- `.claude/README.md` rewritten as "development profile" documentation.
- `.claude/CLAUDE.md` kept as a short TOC that points to canonical policy docs.
- Compatibility wrappers or imports for any `.claude/...` paths still required by current tools.
- A test or audit proving `.claude/` does not contain canonical-only source drift.

## Acceptance Criteria

- Editing canonical skills/scripts no longer requires editing `.claude/skills` or `.claude/scripts` as source.
- `.claude/` can be regenerated or validated from canonical source.
- Active dev-agent behavior still loads necessary repository instructions.
- The dev profile does not include runtime artifacts in package payloads.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  phaseId: "P03"
  parallelEligible: true
  parallelGroup: "wave-3-profile"
  dependsOn: ["P01", "P02"]
  conflictsWith: ["P04", "P06"]
  ownedPaths:
    - ".claude/README.md"
    - ".claude/CLAUDE.md"
    - ".claude/PROJECT.md"
    - ".claude/rules/**"
    - ".claude/skills/**"
    - ".claude/agents/**"
    - ".claude/schemas/**"
    - ".claude/templates/**"
    - ".claude/verification.contract.yaml"
    - ".claude/profile-contract.yaml"
    - ".claude/scripts/moonshot-phase-dispatch.sh"
    - ".claude/scripts/workflow-enforcement.sh"
    - ".claude/scripts/install-browser-runtime.sh"
    - "tests/package-materialization.test.mjs"
  readOnlyPaths:
    - "skills/**"
    - "agents/**"
    - "rules/**"
    - "scripts/**"
    - "schemas/**"
    - "templates/**"
    - "package/package-contract.yaml"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/inventory/**"
  sharedMutablePaths:
    - "tests/package-materialization.test.mjs"
  requiresManualEvidence: true
  mergePolicy: "coordinated_patch"
  allowedMutationType: "dev_profile_only"
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
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/memorygraph-mcp-wrapper.js"
    - ".claude/scripts/code-review-graph-mcp-wrapper.js"
    - ".claude/scripts/codex-mcp-singleton.mjs"
    - ".claude/scripts/lib/phase-event-ledger.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/lib/runtime-unavailable-cache.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
  rollbackRule: "Restore the previous `.claude` profile files and wrappers from git while leaving canonical source directories intact."
  requiredEvidencePaths:
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p03-dev-profile-test.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p03-claude-reference-rg.txt"
    - "docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p03-active-runtime-smoke.md"
  completionCondition: "`.claude/` is documented as dev-only, active agent TOC/verification contract still load, and package materialization tests prove no canonical-source drift or runtime-state payload inclusion."
```

## Task Breakdown

| Task ID | AC Mapping | Files To Edit Or Generate | Exact Commands | Expected Pass Signal | Expected Fail Or Blocker Signal | Review Checkpoint | Evidence Paths |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P03-T01 | AC-01, AC-06 | Edit `.claude/README.md` and `.claude/CLAUDE.md`; optionally `.claude/PROJECT.md`. | `rg -n "canonical source|development profile|generated state" .claude/README.md .claude/CLAUDE.md` | Docs call `.claude/` a dev profile and point to canonical roots. | `.claude/skills` or `.claude/scripts` remains described as source of truth. | Reviewer checks active always-loaded context remains short TOC style. | `evidence/p03-dev-profile-doc-rg.txt` |
| P03-T02 | AC-01, AC-07 | Replace `.claude/skills/**`, `.claude/agents/**`, `.claude/schemas/**`, `.claude/templates/**`, `.claude/scripts/moonshot-phase-dispatch.sh`, `.claude/scripts/workflow-enforcement.sh`, and `.claude/scripts/install-browser-runtime.sh` source copies with wrappers/imports or generated-profile validation. | `node --test tests/package-materialization.test.mjs --test-name-pattern "dev profile"` | Test proves dev profile can be validated or regenerated from canonical source. | Current agent usability breaks, wrapper points to missing canonical path, or P05 state resolver files are modified. | Reviewer performs active-runtime smoke note before shrinking loaded files. | `evidence/p03-dev-profile-test.txt`, `evidence/p03-active-runtime-smoke.md` |
| P03-T03 | AC-03, AC-07 | Edit `tests/package-materialization.test.mjs` to block runtime artifacts in profile payloads. | `rg -n "\\.claude/(skills|agents|scripts|schemas|templates)" docs README.md AGENTS.md .claude` | Remaining hits are marked installed payload, compatibility wrapper, or dev-profile references. | Protected active-runtime paths are moved or deleted. | Reviewer checks blocked path list before approving changes. | `evidence/p03-claude-reference-rg.txt` |
| P03-T04 | AC-01, AC-03, AC-07 | No runtime-state edits. | `git diff --check` | Exit 0. | Phase changes `.claude/docs/phase-status.yaml` or generated logs/cache/traces. | Reviewer confirms `git status` excludes blocked runtime paths. | `evidence/p03-git-diff-check.txt` |

## Critical Scenarios

| Scenario ID | Workflow-Visible Outcome | Verification | Evidence Path |
| --- | --- | --- | --- |
| P03-SCN-01 | Active agents still load repository instructions through `.claude/CLAUDE.md`. | Smoke note confirms TOC imports and verification contract path remain valid. | `evidence/p03-active-runtime-smoke.md` |
| P03-SCN-02 | Editing a canonical skill does not require editing `.claude/skills` as source. | Dev-profile materialization test validates generated/wrapper behavior. | `evidence/p03-dev-profile-test.txt` |
| P03-SCN-03 | Runtime artifacts remain outside profile payloads. | Materialization test rejects logs, cache, traces, browser artifacts, sqlite, memorygraph, and verdict JSON. | `evidence/p03-dev-profile-test.txt` |

## Verification

```bash
node --test tests/package-materialization.test.mjs --test-name-pattern "dev profile"
rg -n "\\.claude/(skills|agents|scripts|schemas|templates)" docs README.md AGENTS.md .claude
git diff --check
```
