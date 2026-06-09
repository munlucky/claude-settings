# Phase 01 - Schema and Vocabulary Contracts v1

## Objective

Define the JSON contracts and vocabulary that allow KG, ontology, and memory-derived knowledge to become compact architecture contracts without exposing raw payloads.

## Dependencies

- None.

## Owned Paths

- `schemas/architecture/applicable-knowledge-slice.schema.json`
- `schemas/architecture/architecture-contract-slice.schema.json`
- `schemas/architecture/architecture-handoff.schema.json`
- `schemas/architecture/architecture-feedback.schema.json`
- `schemas/architecture/kg-relation-vocabulary.schema.json`
- `tests/architecture-knowledge-schema-contract.test.mjs`
- `tests/fixtures/moonshot-architecture/knowledge-binding/schema/`

## Read-only Paths

- `schemas/knowledge-record.schema.json`
- `schemas/knowledge-contract.schema.json`
- `schemas/architecture/architecture-context-pack.schema.json`
- `schemas/verification.contract.yaml`
- `docs/public/project-knowledge-plane.md`

## Staged Paths

- `docs/implementation/architecture-knowledge-contract-binding-2026-06-09/`

## Adoption Targets

- Source checkout only.

## Live Mutation Policy

No live `.claude`, `.codex`, `.moonshot-relay`, account-root, runtime DB, MemoryGraph, or project knowledge state mutation.

## Acceptance Criteria

- Schema files define `ready`, `degraded`, `blocked`, and `failed` status vocabulary where applicable.
- Severity vocabulary includes `info`, `warning`, `blocking`, and `critical`.
- Relation vocabulary includes at least `requires`, `has_scenario`, `derives_asr`, `constrained_by`, `decides`, `supersedes`, `conflicts_with`, `applies_to`, `implemented_by`, `owns_path`, `read_only_path`, `staged_path`, `enforced_by`, `verified_by`, `produces_evidence`, `consults_anchor`, and `handoff_requires`.
- Schemas reject or forbid raw payload fields such as `rawGraph`, `rawOntology`, `rawMemoryGraph`, `transcriptBody`, `runtimeLogBody`, `browserScrapeBody`, and `secret`.
- Fixtures cover valid and invalid status, severity, raw payload, and relation vocabulary cases.

## Verification Signals

- `node --test tests/architecture-knowledge-schema-contract.test.mjs`
- `npm test` after Phase 08 adds the new test to the active gate.

## Handoff Notes

Do not implement resolver selection logic in this phase. This phase creates the contract language that later phases consume.
