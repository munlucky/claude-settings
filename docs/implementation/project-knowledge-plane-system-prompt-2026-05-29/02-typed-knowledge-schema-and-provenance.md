# Phase 02 - Typed Knowledge Schema and Provenance

## Phase Execution Metadata
```yaml
phase: 02
title: "Typed Knowledge Schema and Provenance"
dependsOn: [01]
conflicts: []
ownedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/schemas/knowledge-record.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/schemas/knowledge-provenance.schema.json"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.test.mjs"
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/docs/guidelines/project-knowledge-plane.md"
stagedOwnedPaths:
  - "docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/**"
adoptionTargets:
  - "Phase 07 controlled adoption only"
readOnlyPaths:
  - ".claude/schemas/**"
  - ".claude/scripts/**"
  - ".claude/docs/guidelines/**"
  - ".claude/scripts/memorygraph-project-index.mjs"
  - ".claude/scripts/memorygraph-direct.mjs"
sharedMutablePaths:
  - ".claude/verification.contract.yaml"
mergePolicy: "extend contracts without changing MemoryGraph backend semantics"
liveMutationPolicy: "staged only"
```

## Source Mapping
| Req ID | AC ID | Source | Evidence Target |
|--------|-------|--------|-----------------|
| REQ-003 | AC-003 | User/research typed knowledge plane. | schema tests |

## Goal
Separate knowledge records by persistence semantics so prompt summaries cannot confuse raw observations, verified facts, ontology constraints, and executable policy.

## Scope
- Define record types: `policy_anchor`, `semantic_fact`, `episodic_observation`, `kg_relation`, `ontology_constraint`, `provenance_event`, `promotion_candidate`.
- Define trust tiers: `authoritative`, `verified`, `derived`, `quarantined`, `degraded`.
- Define lifecycle statuses: `observed`, `staged`, `verified`, `superseded`, `archived`, `rejected`.
- Define provenance fields: `factId`, `derivedFrom`, `sourceType`, `sourceRef`, `verifiedBy`, `verifiedAt`, `supersedes`, `sensitivity`.
- Define storage paths:
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/policy/policy-anchors.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/semantic/verified-facts.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/semantic/supersession-log.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/episodic/observations.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/graph/kg-relations.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/ontology/constraints.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/provenance/prov-log.jsonl`
  - `%USERPROFILE%/.codex/state/projects/<projectId>/knowledge/promotion/promotion-candidates.jsonl`

## Minimal Wire Schemas
Every record requires `type`, `id`, `projectId`, `status`, `createdAt`, and `updatedAt`. Status values are per type:

| Type | Additional Required Fields | Allowed Transitions |
|------|----------------------------|---------------------|
| `policy_anchor` | `text`, `sourceRef`, `trustTier`, `verifiedAt`, `supersedes` | `verified -> superseded -> archived` |
| `semantic_fact` | `statement`, `sourceRef`, `trustTier`, `provenanceRef`, `verifiedBy`, `verifiedAt`, `supersedes` | `staged -> verified -> superseded -> archived`; `staged -> rejected` |
| `episodic_observation` | `summary`, `sourceType`, `sourceRef`, `observedAt`, `sensitivity` | `observed -> staged -> archived`; `observed -> rejected` |
| `kg_relation` | `from`, `to`, `relation`, `sourceRef`, `trustTier`, `supersedes` | `derived -> verified -> superseded -> archived`; `derived -> rejected` |
| `ontology_constraint` | `scope`, `appliesTo`, `severity`, `enforcedBy`, `sourceRef`, `supersedes` | `staged -> verified -> superseded -> archived`; `staged -> rejected` |
| `provenance_event` | `subjectId`, `activity`, `agent`, `sourceType`, `sourceRef` | `observed -> verified -> archived` |
| `promotion_candidate` | `targetScope`, `sourceFactId`, `reviewEvidence`, `replayEvidence`, `denialReason` | `staged -> verified -> promoted`; `staged -> rejected`; `verified -> rejected` |

Supersession validation input is a list of `{id, projectId, type, supersedes}` records. Output must include `{ok, cycles, crossProjectViolations}`. `cycles` is blocking. `crossProjectViolations` is blocking unless the record is a verified `promotion_candidate` targeting `global` or `moonshot-harness-core`.

## Non-Scope
- Do not implement full RDF/PROV or OWL reasoning.
- Do not migrate existing graph DB records.

## Detailed Tasks
| Task | Action | Files | Command | Pass Signal | Blocker |
|------|--------|-------|---------|-------------|---------|
| T01 | Add schema for typed records and provenance events. | schema files | `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.test.mjs` | all required fields validated | raw observation accepted as semantic fact |
| T02 | Add parser/validator helper for JSONL records and promotion candidates. | `knowledge-records.mjs` | same test | invalid trust/status rejected | unknown type silently accepted |
| T03 | Add supersession rule: verified semantic facts are superseded, not deleted. | tests + guideline | same test | `supersedes` chain required | destructive delete allowed |
| T04 | Add quarantine rule for external/transcript/browser/tool output. | tests + guideline | same test | unverified external source cannot become semantic fact | prompt poisoning path remains |

## Acceptance Criteria
- AC-003: Schema distinguishes policy, semantic, episodic, KG, ontology, provenance, and promotion records.
- AC-004: External or transcript-derived content is quarantined until schema validation and evidence verification pass.
- AC-005: Superseded facts remain reconstructable through provenance links.

## Verification Plan
- `node --test docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.test.mjs`
- `node --check docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/execution/staging/phase-02/.claude/scripts/knowledge-records.mjs`
- `git diff --check -- .claude docs/implementation/project-knowledge-plane-system-prompt-2026-05-29`

## Completion Checklist
- [ ] Typed schema rejects flat/untrusted records.
- [ ] Supersession and provenance tests pass.
- [ ] Quarantine-to-semantic promotion requires verification evidence.
