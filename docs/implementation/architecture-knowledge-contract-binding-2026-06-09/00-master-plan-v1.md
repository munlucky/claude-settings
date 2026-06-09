# Architecture Knowledge Contract Binding - Master Plan v1

## Scope Status

Status: phase-runner-execution-ready

This package plans the next ontology, knowledge graph, and memory enhancement for Moonshot Relay. It does not replace the existing `harness-control-plane-modernization` Phase 09 memory promotion ledger. That phase already owns evidence-gated memory promotion, rollback, and stale-warning behavior. This package owns a later architecture binding layer that turns verified knowledge into execution constraints.

## Objective

Extend `moonshot-architecture` from prompt-safe knowledge context into contract-backed architecture handoff:

```text
KG/Ontology/Memory records
  -> ApplicableKnowledgeSlice
  -> ArchitectureContractSlice
  -> ArchitectureHandoff
  -> execution and verification control
```

The goal is not to put more knowledge text into prompts. The goal is to resolve the knowledge slice that applies to the current objective, bind it into requirements, decisions, constraints, path boundaries, enforcement rules, and verification signals, then hand a compact contract to `moonshot-orchestrator` or `moonshot-phase-runner`.

## Collision Policy

- Existing roadmap phase `docs/public/roadmaps/harness-control-plane-modernization/09-memory-promotion-knowledge-and-decision-ledger-v2.md` remains the memory promotion ledger phase.
- This package uses a separate implementation root: `docs/implementation/architecture-knowledge-contract-binding-2026-06-09`.
- Internal phases start at 01 to avoid overloading the existing Phase 09 name.
- This plan is source-first. Live `.claude`, `.codex`, `.moonshot-relay`, and account-root adoption are out of scope until a later explicitly approved sync or rollout step.

## Safety Contract

- Never write raw KG node or edge dumps, raw ontology records, raw MemoryGraph records, runtime logs, transcripts, browser scrape bodies, prompt archives, or secret-like strings into plan docs, handoff JSON, feedback text, review prompts, or runtime manifests.
- Prompt-facing and handoff-facing artifacts may include compact IDs, typed summaries, source references, provenance references, omission categories, status fields, path boundaries, and verification signals.
- A blocked architecture handoff must not be dispatched to `moonshot-orchestrator` or `moonshot-phase-runner`.
- Knowledge-derived facts remain advisory until they are verified, bound into an explicit architecture contract, and tied to enforcement and verification evidence.

## Architecture Inputs

| Input | Role |
|---|---|
| `docs/implementation/current-architecture-2026-06-09/` | Current brownfield architecture recovery and authority-boundary evidence. |
| `scripts/knowledge-context-build.mjs` | Existing stage-aware project knowledge context builder. |
| `scripts/architecture-context-build.mjs` | Existing architecture context wrapper; should point to binding commands, not absorb all binding behavior. |
| `docs/public/project-knowledge-plane.md` | Existing lifecycle policy for observe, stage, verify, promote, supersede, and archive. |
| `schemas/knowledge-record.schema.json` | Existing typed knowledge record contract. |
| `schemas/verification.contract.yaml` | Verification profile and policy authority. |
| `package/runtime-surface.json` | Runtime public skill surface authority; this plan must not add a public skill. |

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: "phase-runner-execution-ready"
  planRoot: "docs/implementation/architecture-knowledge-contract-binding-2026-06-09"
  selectedMasterPlan: "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/00-master-plan-v1.md"
  selectedPhaseDocs:
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/01-schema-vocabulary-contracts-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/02-applicable-knowledge-resolver-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/03-architecture-contract-binder-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/04-architecture-handoff-builder-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/05-feedback-renderer-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/06-workflow-skill-integration-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/07-package-runtime-surface-v1.md"
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/08-regression-closeout-gates-v1.md"
  reviewArtifacts:
    - "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/planning-loop/plan-quality-review-iter-01.yaml"
  executionRoot: "docs/implementation/architecture-knowledge-contract-binding-2026-06-09/execution"
  statusFile: ".moonshot-relay/docs/phase-status.yaml"
  dryRunCommand: "node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir docs/implementation/architecture-knowledge-contract-binding-2026-06-09 --master-plan docs/implementation/architecture-knowledge-contract-binding-2026-06-09/00-master-plan-v1.md --status-file .moonshot-relay/docs/phase-status.yaml --execution-root docs/implementation/architecture-knowledge-contract-binding-2026-06-09/execution"
  readinessDecision: "runnable_after_review_artifact"
```

## Phase Runner Execution Index

| Phase | Title | Plan File | Depends On | Parallel |
|---|---|---|---|---|
| 01 | Schema and Vocabulary Contracts | `01-schema-vocabulary-contracts-v1.md` | - | no |
| 02 | Applicable Knowledge Resolver | `02-applicable-knowledge-resolver-v1.md` | 01 | no |
| 03 | Architecture Contract Binder | `03-architecture-contract-binder-v1.md` | 01, 02 | no |
| 04 | Architecture Handoff Builder | `04-architecture-handoff-builder-v1.md` | 03 | no |
| 05 | Feedback Renderer | `05-feedback-renderer-v1.md` | 03, 04 | partial |
| 06 | Workflow Skill Integration | `06-workflow-skill-integration-v1.md` | 04, 05 | no |
| 07 | Package Runtime Surface | `07-package-runtime-surface-v1.md` | 06 | no |
| 08 | Regression and Closeout Gates | `08-regression-closeout-gates-v1.md` | 01-07 | no |

## Source Traceability Matrix

| Req ID | Requirement Summary | Phase | Acceptance Evidence |
|---|---|---|---|
| AKCB-REQ-01 | Define machine-readable schemas and relation vocabulary for applicable slice, contract slice, handoff, feedback, and relation terms. | 01 | Schema contract tests reject raw payload fields and invalid status/severity values. |
| AKCB-REQ-02 | Resolve task-applicable knowledge from objective, mode, stage, changed files, path hints, KG relations, ontology constraints, semantic facts, policy anchors, and project-local knowledge anchors. | 02 | Resolver tests prove selection, omission, consulted/skipped anchors, trust/status ordering, and prompt-safe output. |
| AKCB-REQ-03 | Bind applicable knowledge into architecture constraints, decisions, requirements, path boundaries, enforcement rules, and verification signals. | 03 | Binder tests block missing enforcement, missing verification signal, conflict, and path-boundary overlap. |
| AKCB-REQ-04 | Build compact architecture handoff JSON and prompt block for orchestrator or phase-runner consumption. | 04 | Handoff tests prove ready/blocked states, target recommendation, selected IDs, read-before-retry refs, and no raw payload. |
| AKCB-REQ-05 | Render contract violation feedback that tells the agent what to read and what action to take before retry. | 05 | Feedback tests prove actionable violation output and leakage guards. |
| AKCB-REQ-06 | Integrate contract/handoff requirements into architecture gate, plan writer, orchestrator, and phase runner skill contracts. | 06 | Workflow contract tests prove architecture-heavy handoff requires ready contract and blocked handoff cannot dispatch. |
| AKCB-REQ-07 | Include new runtime support scripts and schemas in common payload without expanding profile-local public skill discovery. | 07 | Package tests and dry-run prove payload inclusion and public surface stability. |
| AKCB-REQ-08 | Add end-to-end positive and negative regression coverage to the active test gate. | 08 | `npm test`, `npm run test:package`, leakage tests, and blocked-dispatch tests pass. |

## Runtime Surface Invariant

`package/runtime-surface.json` is read-only for this plan. Before and after Phases 06 and 07, implementation must confirm that `publicRuntimeSkills` remains unchanged. New resolver, binder, handoff, and feedback behavior belongs in common payload scripts, schemas, and existing public skill contracts, not in a new profile-local public skill.

## Adoption Strategy

| Stage | Adoption Target | Policy |
|---|---|---|
| 01-06 | Source checkout only | Edit canonical source only. No live account-root mutation. |
| 07 | Package/common payload | Update package contract and materializer; run package tests and dry-runs. |
| 08 | Verification/readiness | Establish source completion evidence. Live account-root sync remains separate and requires explicit approval. |

## Closeout Authority

- Phase-local completion requires the active phase checklist, source diff, targeted tests, and execution artifacts under the configured execution root when phase-runner is used.
- Whole-plan completion is not established by this plan file, a review artifact, or `phase-status.yaml`.
- If execution changes runtime support scripts or package payloads, accepted completion requires fresh verification-plane evidence and `scripts/runtime-state.mjs assess-completion --json` only when a whole-plan closeout is explicitly requested.
- Account-root install parity is a separate operational closeout item, not implied by source tests.
