# Phase 09 - Memory Promotion, Knowledge, and Decision Ledger v2

## Goal

Prevent contaminated long-term memory while preserving useful decisions, lessons, and recovery facts.

## Execution Metadata

- Dependencies: Phase 04, Phase 08.
- Owned paths: `skills/harness-memory-promoter/**`, `agents/harness-memory-promoter.*.md`, `docs/public/guidelines/knowledge-repository-ops.md`, `docs/public/guidelines/document-memory-policy.md`, planned `docs/public/project-knowledge-plane.md`, `scripts/knowledge-improvement-lifecycle.mjs`, planned `scripts/lib/awtl-memory-promotion.mjs`, `scripts/lib/runtime-state-store.mjs`, `schemas/memory-promotion-ledger.schema.json`, `tests/memory-promotion-contract.test.mjs`, `tests/fixtures/harness-control-plane/**`.
- Read-only paths: account-root project knowledge state except explicit temp knowledge roots, raw memory graph records, transcripts, secret-like strings.
- Adoption targets: source policy and temp knowledge-root replay.
- Live mutation policy: live memory/account-root promotion is forbidden until controlled rollout approval.
- Required evidence: promotion evidence fixture, stale knowledge warning fixture, rollback fixture, no-memory-as-authority fixture.
- Conflicts: raw memory graph copy into plans, memory as completion authority, live account-root memory mutation during planning.
- Staged paths: memory promoter docs/agents, knowledge policy docs, memory fixtures.
- Closure traceability: promotion ledger entry, stale warning output, rollback audit.

## Required Work

- Define promotion inputs: fresh evidence, reviewer approval, replay result, rollback plan, and scope owner.
- Record promotion decisions in runtime events or dedicated memory ledger.
- Treat task/day/week/month as promotion cadence stages, not as storage path names or context pack types.
- Keep harness ontology/KG/memory and project ontology/KG/memory separated by scope and owner; context packs may link them but canonical records must not be mixed.
- Keep candidate memory in candidate/review fields until promotion gates pass; never render candidate memory as `semanticFacts`, prompt-facing verified facts, or completion authority.
- Add stale warning behavior for outdated project knowledge.
- Mark context packs that depend on rolled-back promotions as stale through `contextPackRef`/lineage warnings.
- Keep project knowledge separate from completion authority.
- Add rollback and removal evidence for promoted memory.

## Acceptance Criteria

- No memory entry can become completion authority.
- Promotion requires evidence and review.
- Stale memory produces warnings in context/read model.
- Rollback can remove or supersede a promoted lesson without deleting audit history.
- Rollback of a promoted fact/relation invalidates or stales related `contextPackRef` projections before they can be reused.
- Candidate memory remains review-only until evidence, replay, reviewer approval, rollback plan, and scope ownership gates pass.

## Regression Contract

- Memory promotion without evidence, review, replay, or rollback plan is rejected.
- Memory-derived facts can produce stale warnings but cannot override runtime completion authority.
- Rollback supersedes memory without deleting audit history.
- Raw MemoryGraph/KG/ontology records are not copied into plan docs.
- Cadence updates produce promotion deltas or stale warnings, not raw daily/weekly/monthly memory dumps in agent prompts.

## Completion Evidence

- `npm test`
- Memory promotion fixture
- Stale warning fixture
- Rollback fixture
- Context-pack stale projection fixture after promotion rollback
