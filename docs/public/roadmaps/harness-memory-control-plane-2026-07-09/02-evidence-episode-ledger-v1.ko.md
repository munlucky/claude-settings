# Phase 02: Evidence Episode Ledger and Memory Claim Contract v1

## Goal

Add a contract for episode memory and memory claims so every durable fact has provenance, confidence, validity, sensitivity, and verification state before it can influence retrieval, promotion, score, or replan.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-002 | uploaded research sections 2, 8 | Memory facts require evidence and write-time validation. | Define claim schema and ledger validation. |
| REQ-MEM-007 | existing Phase 09 | Promotion requires evidence, review, replay, rollback, and scope owner. | Claim ledger feeds the existing promotion ledger; promotion-ledger changes require a Phase 01 proven gap. |
| SCN-MEM-003 | memory-promotion tests | Rollback supersedes without deleting audit history. | Preserve audit and stale projection behavior. |

## Expected Outcome

- A source contract for episode records and memory claims.
- A validation path that rejects durable claims without evidence, artifact hash, source command or source ref, confidence, scope, stage, sensitivity classification, and validity metadata.
- Runtime-state integration plan that keeps raw episode logs in generated state and stores only typed decisions/claims needed for verification.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-current-memory-plane-baseline-v1.ko.md"
  conflictsWith:
    - "Any phase that changes prompt retrieval semantics before claim trust states exist."
  ownedPaths:
    - "planned: schemas/memory-claim.schema.json"
    - "planned: schemas/episode-ledger.schema.json"
    - "planned: scripts/memory-claim-validate.mjs"
    - "planned: scripts/lib/memory-claim-ledger.mjs"
    - "planned: tests/memory-claim-ledger-contract.test.mjs"
    - "planned: tests/fixtures/harness-control-plane/memory-claim-ledger/**"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md"
  readOnlyPaths:
    - "scripts/awtl-memory-promotion.mjs"
    - "scripts/lib/awtl-memory-promotion.mjs"
    - "schemas/memory-promotion-ledger.schema.json"
    - "tests/memory-promotion-contract.test.mjs"
    - "C:/Users/moon/.moonshot-relay/**"
  sharedMutablePaths:
    - "scripts/runtime-state.mjs"
    - "scripts/lib/runtime-state-store.mjs"
  conditionalOwnedPathsAfterMigrationPolicy:
    - "scripts/runtime-state.mjs"
    - "scripts/lib/runtime-state-store.mjs"
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "package.json"
        - "docs/public/guidelines/document-memory-policy.md"
        - "docs/public/project-knowledge-plane.md"
      requiredEvidenceSlots:
        - "targeted_tests"
        - "independent_review"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-data-state"
      category: "data_or_state_migration"
      policySourcePaths:
        - "schemas/memory-promotion-ledger.schema.json"
        - "missing-policy: migration rollback manifest for memory claim tables"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommandsSource: "missing_policy"
  requiresManualEvidence: false
  mergePolicy: "coordinate_runtime_state_edits"
```

## Scope

Included:

- Define `MemoryClaim` and `EpisodeLedger` record contracts.
- Add a write-time validator for claim trust states: `candidate`, `verified`, `rejected`, `superseded`, `rolled_back`.
- Preserve raw episodes as generated state and source docs as compact policy.
- Map claim IDs to `CommandRun`, `ReviewFinding`, `TestResult`, `Artifact`, and promotion decision IDs where available.

Excluded:

- Long-term graph backend implementation.
- Live account-root writes.
- Automatic procedural memory promotion.
- Completion authority changes based solely on memory.

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P02-1 | Claim schema | Add schema fields for evidence, artifact hash/ref, source command/ref, stage, scope, confidence, sensitivity, validity, supersession. | Invalid durable claims without evidence are rejected by schema/validator. |
| P02-2 | Episode ledger boundary | Define generated-state episode record shape and source-safe summary projection. | Raw logs/transcripts stay generated; source stores only contract and fixtures. |
| P02-3 | Runtime-state integration plan | Decide whether claims are separate runtime table or extension to promotion decisions. | Migration and rollback blocker is explicit before non-dry-run mutation. |
| P02-4 | Regression tests | Add fixtures for accepted verified claim, rejected evidence-free claim, stale claim, superseded claim, and secret-like claim denial. | Targeted tests fail before implementation and pass after implementation. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P02-1 | `schemas/memory-claim.schema.json` | none | `tests/memory-claim-ledger-contract.test.mjs` | `node --test tests/memory-claim-ledger-contract.test.mjs` | Evidence-free durable claim is rejected. |
| P02-2 | `schemas/episode-ledger.schema.json` | `docs/public/guidelines/memory-control-plane.md` | `tests/memory-claim-ledger-contract.test.mjs` | `node --test tests/memory-claim-ledger-contract.test.mjs` | Raw episode body cannot be source/prompt claim. |
| P02-3 | none | `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs` only after migration policy exists | `tests/memory-promotion-contract.test.mjs` | `node --test tests/memory-promotion-contract.test.mjs` | Existing promotion ledger behavior remains unchanged. |

## Verification Plan

- [ ] `node --test tests/memory-promotion-contract.test.mjs`
- [ ] `node --test tests/memory-claim-ledger-contract.test.mjs`
- [ ] Schema validation fixtures for verified/rejected/stale/superseded/secret-like claims.
- [ ] Manual source review that no raw episode payload is copied into docs.

## Completion Evidence

- Schema files and validator output.
- Targeted test output.
- Migration policy decision or explicit blocker.
- Review artifact confirming memory is still advisory, not completion authority.

## Handoff Notes

Phase 03 can consume only `verified` and prompt-safe claim projections. It must ignore `candidate`, `rejected`, raw episode, and generated-state records except for omission metadata and stale warnings.
