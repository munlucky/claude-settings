# Phase 03: Stage-Scoped Retrieval and Prompt Context Packs v1

## Goal

Make memory retrieval explicitly stage-scoped so each harness stage gets only the memory categories it is allowed to use, with omissions and stale warnings preserved as typed metadata.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-001 | uploaded research sections 1, 5 | Memory harnesses should be stage/task-specific. | Extend current stage rules beyond intake/plan/execute/verify/finish as needed. |
| REQ-MEM-004 | uploaded research section 5 | Each stage needs read/write/verify policy. | Add retrieval policy matrix and tests. |
| SCN-MEM-002 | knowledge-context-build | Prompt block remains compact even when contextPack is richer. | Preserve legacy promptBlock and metadata contract. |

## Expected Outcome

- A retrieval policy matrix for `init`, `requirements`, `design`, `plan`, `validate-plan`, `prepare`, `execute`, `review`, `verify`, `score`, `replan`, and `close`.
- Context packs that separate prompt-facing facts from local-only metadata, evidence refs, omitted categories, and runtime authority refs.
- Tests showing solution memory is restricted during requirements, evidence-only context is used during verify/score, and candidate memory never appears as verified semantic facts.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-current-memory-plane-baseline-v1.ko.md"
    - "02-evidence-episode-ledger-v1.ko.md"
  conflictsWith:
    - "Phase 04 ontology gates if retrieval categories are still undefined."
  ownedPaths:
    - "planned: docs/public/guidelines/memory-control-plane.md"
    - "planned: schemas/context-pack-v2.schema.json"
    - "planned: scripts/knowledge-context-build.mjs"
    - "planned: tests/knowledge-context-build-contract.test.mjs"
    - "planned: tests/fixtures/harness-control-plane/stage-scoped-retrieval/**"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md"
  readOnlyPaths:
    - "schemas/knowledge-contract.schema.json"
    - "docs/public/project-knowledge-plane.md"
    - "docs/public/guidelines/document-memory-policy.md"
    - "raw memory graph records"
    - "runtime logs and transcripts"
  sharedMutablePaths:
    - "scripts/knowledge-context-build.mjs"
    - "tests/knowledge-context-build-contract.test.mjs"
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "package.json"
        - "docs/public/guidelines/document-memory-policy.md"
        - "docs/public/guidelines/context-relevance-policy.md"
        - "schemas/context-pack.schema.json"
      requiredEvidenceSlots:
        - "targeted_tests"
        - "independent_review"
      concreteGateCommandsSource: "project_policy"
  requiresManualEvidence: false
  mergePolicy: "coordinate_context_builder_edits"
```

## Scope

Included:

- Define allowed read categories per stage: policy anchors, semantic facts, graph synopsis, ontology constraints, failure memory, command/test evidence, review findings, promotion decisions, stale warnings, and omissions.
- Define write policy per stage but keep actual writes in Phase 02/04 contracts.
- Preserve `projectKnowledgeContext.promptBlock` compatibility for existing consumers.
- Ensure `contextPack` can carry evidence refs and omissions without exposing raw payloads.
- Treat `schemas/context-pack-v2.schema.json` as an extension candidate. It must preserve `ContextPackV1` compatibility unless Phase 01 records an explicit migration decision and rollback plan.

Excluded:

- Full graph traversal implementation.
- External vector DB or Graphiti/Neo4j selection.
- Raw transcript replay in prompts.

## Stage Policy Draft

| Stage | Allowed Prompt Context | Local-Only Metadata | Forbidden |
|---|---|---|---|
| init | policy anchors, compact similar task synopsis | raw brief episode ref | prior solution patch |
| requirements | domain constraints, non-goals, verified acceptance patterns | candidate related failures | design conclusions as requirements |
| design | ADR synopsis, verified prior failures, rollback patterns | alternatives/risk graph refs | unverified best-practice claims |
| plan | verified commands, test patterns, phase templates | write-set drift and dependency refs | success claims before execution |
| validate-plan | ontology constraints, spec-test obligations | plan graph diagnostics | incomplete plan pass-through |
| prepare | baseline setup issues, worktree policy | environment snapshot refs | dirty-worktree exception without owner |
| execute | current chunk, verified failure memory, code pattern synopsis | command run refs | procedural memory promotion |
| review | prior blocking findings, security policy | reviewer lineage refs | severity inflation |
| verify | acceptance criteria, evidence refs, ontology constraints | omitted raw logs | completion from memory |
| score | verify result and memory quality metrics | score input refs | subjective LLM score |
| replan | failure class, previous attempts, delta history | replay candidates | repeated same failed approach |
| close | final evidence, promotion candidates | promotion decision refs | unverified durable memory |

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P03-1 | Retrieval policy matrix | Encode stage categories and omissions in docs and tests. | Each stage has explicit allowed and forbidden categories. |
| P03-2 | Context pack v2 contract | Define prompt/local/evidence/omission separation. | Legacy promptBlock consumers still pass. |
| P03-3 | Candidate memory suppression | Ensure candidate/rejected memory is local-only and never rendered as verified semantic facts. | Regression fixture catches unsafe rendering. |
| P03-4 | Stale warning propagation | Preserve stale warnings in metadata and prompt-safe summary. | Stale facts warn without satisfying verification. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P03-1 | `planned: tests/fixtures/harness-control-plane/stage-scoped-retrieval/*.jsonl` | `scripts/knowledge-context-build.mjs` | `tests/knowledge-context-build-contract.test.mjs` | `node --test tests/knowledge-context-build-contract.test.mjs` | Stage policies are enforced. |
| P03-2 | `schemas/context-pack-v2.schema.json` | `schemas/knowledge-contract.schema.json` only if compatibility is preserved | `tests/context-pack-contract.test.mjs` | `npm test` | Existing compact-summary contract still passes. |
| P03-3 | none | `scripts/knowledge-context-build.mjs` | `tests/knowledge-context-build-contract.test.mjs` | `node --test tests/knowledge-context-build-contract.test.mjs` | Candidate memory omitted from verified facts. |

## Verification Plan

- [ ] `node --test tests/knowledge-context-build-contract.test.mjs`
- [ ] `node --test tests/context-pack-contract.test.mjs`
- [ ] `npm test` before package/runtime adoption claims.
- [ ] Review context output for prompt-unsafe category omissions.

## Completion Evidence

- Retrieval policy matrix.
- Context pack schema/compatibility tests.
- Stale and candidate memory suppression fixtures.
- Review confirmation that raw MemoryGraph/KG/ontology dumps do not enter prompt blocks.

## Handoff Notes

Phase 04 should build memory quality gates against this retrieval policy. If a stage's allowed categories are ambiguous, Phase 04 must block rather than guess.
