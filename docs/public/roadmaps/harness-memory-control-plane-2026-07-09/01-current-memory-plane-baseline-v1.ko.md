# Phase 01: Current Memory Plane Baseline and Scope Freeze v1

## Goal

Freeze the current memory/knowledge/ontology implementation boundary before adding new control-plane behavior. The baseline must distinguish implemented source truth, planned roadmap truth, generated runtime state, account-root memory, and external research direction.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-001 | uploaded research sections 1, 5 | Memory must be stage/task-specific. | Inventory current stage handling in `knowledge-context-build`. |
| REQ-MEM-006 | uploaded research section 10 | Start file-first and avoid premature backend selection. | Record current file/schema/script-first boundary. |
| SCN-MEM-001 | document-memory-policy | Raw state must not enter source docs/prompts. | Verify generated-state and prompt-unsafe boundaries. |

## Expected Outcome

- A current-truth inventory for memory-related scripts, schemas, docs, tests, fixtures, and generated-state exclusions.
- A gap map showing what already exists vs what the new memory control-plane roadmap still needs.
- A frozen implementation boundary that prevents duplicating or bypassing existing Phase 09 promotion contracts.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "Any phase that edits memory schema or runtime-state behavior before baseline is accepted."
  ownedPaths:
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md"
    - "planned: docs/public/guidelines/memory-control-plane.md"
    - "planned: tests/fixtures/harness-control-plane/memory-control-plane-baseline.json"
  readOnlyPaths:
    - "scripts/knowledge-context-build.mjs"
    - "scripts/awtl-memory-promotion.mjs"
    - "scripts/lib/awtl-memory-promotion.mjs"
    - "scripts/ontology-constraint-validate.mjs"
    - "scripts/runtime-state.mjs"
    - "schemas/knowledge-contract.schema.json"
    - "schemas/memory-promotion-ledger.schema.json"
    - "schemas/ontology-constraint.schema.json"
    - "docs/public/project-knowledge-plane.md"
    - "docs/public/guidelines/document-memory-policy.md"
    - "docs/public/guidelines/memorygraph-workflow.md"
    - "docs/public/roadmaps/harness-control-plane-modernization/**"
    - ".moonshot-relay/**"
    - "C:/Users/moon/.moonshot-relay/**"
  sharedMutablePaths: []
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "docs/public/guidelines/document-memory-policy.md"
      requiredEvidenceSlots:
        - "independent_review"
        - "plan_graph_or_markdown_compatibility"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-data-state"
      category: "data_or_state_migration"
      plannedMutation: "read-only audit only in this phase; no runtime-state mutation"
      policySourcePaths:
        - "docs/public/guidelines/memorygraph-workflow.md"
        - "missing-policy: runtime-state migration rollback manifest"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommandsSource: "missing_policy"
  requiresManualEvidence: false
  mergePolicy: "baseline_before_mutation"
```

## Scope

Included:

- Inventory implemented helpers, schemas, tests, and docs.
- Identify stale or overlapping roadmap language between this package and existing Phase 09.
- Record generated-state boundaries and prompt-unsafe exclusions.
- Define baseline acceptance evidence for later implementation.

Excluded:

- Editing runtime-state schema.
- Adding backend dependencies.
- Writing account-root knowledge or MemoryGraph state.
- Changing package payload or installed profiles.

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P01-1 | Memory surface inventory | List scripts, schemas, docs, tests, and fixtures currently governing knowledge, memory, ontology, and promotion. | Inventory names source paths and their authority level. |
| P01-2 | Existing Phase 09 alignment | Compare this roadmap with `09-memory-promotion-knowledge-and-decision-ledger-v2.md`. | Overlap and extension points are recorded. |
| P01-3 | Generated-state exclusion audit | Confirm raw logs, transcripts, KG dumps, ontology dumps, sqlite state, and browser traces remain out of source and prompt packs. | Policy gaps are named, not silently bypassed. |
| P01-4 | Baseline fixture plan | Define fixture shape for a baseline memory-control-plane inventory. | Later implementation has a stable expected fixture target. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P01-1 | `planned: tests/fixtures/harness-control-plane/memory-control-plane-baseline.json` | none in planning; future source phase may add fixture | none | `rg --files | rg "memory|knowledge|ontology|context|promotion"` | Inventory includes existing surfaces. |
| P01-2 | none | `planned: docs/public/guidelines/memory-control-plane.md` | none | `rg -n "memory promotion|knowledge|ontology|completion authority" docs/public/roadmaps docs/public/guidelines` | Existing contracts are not duplicated as new authority. |
| P01-3 | none | `planned: docs/public/guidelines/memory-control-plane.md` | `planned: tests/knowledge-context-build-contract.test.mjs` | `node --test tests/knowledge-context-build-contract.test.mjs` | Prompt context remains compact and prompt-safe. |

## Verification Plan

- [ ] Run source inventory search and attach result summary to implementation evidence.
- [ ] Run `node --test tests/knowledge-context-build-contract.test.mjs` after any context contract change.
- [ ] Run `$docs=@('docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md') | ConvertTo-Json -Compress; node scripts/plan-graph-validate.mjs --markdown-phase-docs-json $docs --json` for markdown compatibility.
- [ ] Record unresolved data migration policy as blocker if runtime-state tables are proposed.

## Completion Evidence

- Current-truth inventory artifact.
- Gap map against existing Phase 09.
- Independent review finding closure.
- Confirmation that no raw generated memory/state was copied into source docs.

## Handoff Notes

Phase 02 must not create new durable memory write paths until Phase 01 confirms whether current `runtime-state.mjs` memory promotion tables can be extended or need a separate claim ledger.
