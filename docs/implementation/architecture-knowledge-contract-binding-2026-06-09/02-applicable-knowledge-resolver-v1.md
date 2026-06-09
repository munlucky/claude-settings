# Phase 02 - Applicable Knowledge Resolver v1

## Objective

Add `scripts/architecture-knowledge-resolve.mjs` to select the knowledge records applicable to a specific architecture task by objective, mode, stage, changed files, path hints, trust/status, KG adjacency, ontology applicability, and project-local knowledge anchors.

## Dependencies

- Phase 01.

## Owned Paths

- `scripts/architecture-knowledge-resolve.mjs`
- `tests/architecture-knowledge-resolve.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/resolver/`

## Read-only Paths

- `scripts/knowledge-context-build.mjs`
- `scripts/architecture-context-build.mjs`
- `scripts/knowledge-records.mjs`
- `scripts/ontology-constraint-validate.mjs`
- `AGENTS.md`
- `docs/public/guidelines/knowledge-repository-ops.md`
- `docs/public/project-knowledge-plane.md`
- `schemas/knowledge-record.schema.json`

## Staged Paths

- `schemas/architecture/applicable-knowledge-slice.schema.json`

## Adoption Targets

- Source checkout only.

## Live Mutation Policy

The resolver is read-only. It must not write MemoryGraph, project knowledge records, ontology constraints, or runtime-state rows.

## Acceptance Criteria

- CLI accepts `--cwd`, `--mode`, `--stage`, `--objective`, `--changed-files-json`, optional path hints, and `--json`.
- Output artifact is `APPLICABLE_KNOWLEDGE_SLICE`.
- Selected records are grouped as compact `policyAnchors`, `semanticFacts`, `kgRelations`, `ontologyConstraints`, and `knowledgeAnchors`.
- Selection prioritizes objective keyword match, changed file path match, ontology `appliesTo`, KG adjacency, record stages, verified/authoritative trust tier, and blocking/critical severity.
- Project root `AGENTS.md` `knowledgeAnchors` are parsed when present; resolver records consulted, skipped, unavailable, reason, and consumed paths without copying full agreement bodies.
- Degraded, stale, unavailable, and omitted categories are preserved as typed metadata.
- Raw KG, ontology, memory, transcript, log, browser scrape, and secret-like content are omitted or rejected.

## Verification Signals

- `node --test tests/architecture-knowledge-resolve.test.mjs`
- Leakage negative test using raw payload sentinel fixture.

## Handoff Notes

This phase should reuse existing project identity and knowledge root resolution patterns where practical, but it must keep resolver output prompt-safe and contract-oriented.
