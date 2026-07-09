# Phase 04: Task Evidence Graph, Ontology Validation, and Verify Gates v1

## Goal

Turn graph/ontology memory from a retrieval convenience into executable validation. The harness must know which task, requirement, plan chunk, command, test result, artifact, failure, review finding, and policy produced a memory claim before that claim can influence verification or replan.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-003 | uploaded research sections 3, 4 | Graph/ontology constraints enforce relationship and type rules. | Add executable constraints and validators. |
| REQ-MEM-005 | uploaded research section 6 | Memory quality must block stale or unauthorized memory use. | Add verification-plane memory gate result. |
| REQ-MEM-004 | uploaded research section 5 | Verify stage should read evidence, not solution memory. | Validate stage-scoped evidence graph. |

## Expected Outcome

- A file-first task/evidence graph contract for `Task`, `Requirement`, `AcceptanceCriterion`, `DesignDecision`, `PlanChunk`, `CommandRun`, `TestResult`, `Failure`, `ReviewFinding`, `Artifact`, `MemoryFact`, and `Policy`.
- Ontology rules that require evidence edges for verified memory facts, acceptance criteria for requirements, command-run provenance for test results, and supersession for stale facts.
- Verification-plane integration that emits memory-gate results: provenance coverage, stale memory use, unauthorized memory access, candidate-as-fact violations, and PII/secret-like violations.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "02-evidence-episode-ledger-v1.ko.md"
    - "03-stage-scoped-retrieval-and-context-packs-v1.ko.md"
  conflictsWith:
    - "Score policy changes that do not consume verification-plane evidence."
  ownedPaths:
    - "planned: schemas/task-evidence-graph.schema.json"
    - "planned: schemas/memory-control-plane-gate.schema.json"
    - "schemas/ontology-constraint.schema.json"
    - "scripts/ontology-constraint-validate.mjs"
    - "scripts/verification-plane.mjs"
    - "scripts/lib/verification-plane.mjs"
    - "planned: tests/verification-plane-contract.test.mjs"
    - "planned: tests/fixtures/harness-control-plane/memory-gates/**"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md"
  readOnlyPaths:
    - "scripts/runtime-state.mjs"
    - "scripts/knowledge-context-build.mjs"
    - "schemas/memory-promotion-ledger.schema.json"
    - "generated runtime DB/WAL/SHM"
    - "raw graph and ontology dumps"
  sharedMutablePaths:
    - "scripts/verification-plane.mjs"
    - "scripts/lib/verification-plane.mjs"
    - "scripts/ontology-constraint-validate.mjs"
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "schemas/verification.contract.yaml"
        - "package.json"
      requiredEvidenceSlots:
        - "targeted_tests"
        - "independent_review"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-data-state"
      category: "data_or_state_migration"
      policySourcePaths:
        - "missing-policy: verify memory gate persistence and rollback manifest"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommandsSource: "missing_policy"
  requiresManualEvidence: false
  mergePolicy: "single_writer_for_verification_plane"
```

## Ontology Constraint Draft

| Rule ID | Constraint | Purpose |
|---|---|---|
| ONT-MEM-001 | `TestResult` must derive from `CommandRun` or equivalent evidence record. | Block fake test evidence. |
| ONT-MEM-002 | `Requirement` must link to at least one `AcceptanceCriterion` or explicit blocker. | Block vague requirements. |
| ONT-MEM-003 | `MemoryFact(status=verified)` must derive from evidence and a verification result. | Block hallucinated durable memory. |
| ONT-MEM-004 | stale or superseded facts must carry `valid_to`, `supersedes`, or stale warning metadata. | Block stale fact pollution. |
| ONT-MEM-005 | `ReviewFinding(severity=blocking)` must include evidence and owner/status. | Avoid ungrounded blocker inflation. |
| ONT-MEM-006 | `verify.memory_gates` can consume stage-scoped retrieval output and evidence graph only. | Block memory-as-completion authority. |

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P04-1 | Task/evidence graph contract | Add schema and fixtures for allowed nodes/edges. | Missing requirement->acceptance and test->command edges block. |
| P04-2 | Ontology constraints | Add constraint records and validator fixtures. | Invalid relationships produce blocking diagnostics. |
| P04-3 | Verify memory gates | Add memory gate result to verification plane. | Missing provenance, stale use, unauthorized access, candidate-as-fact, and PII violation are reported. |
| P04-4 | Phase 09 amendment check | Identify only gaps not already covered by memory promotion tests. | Existing Phase 09 contracts are cited, not duplicated. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P04-1 | `schemas/task-evidence-graph.schema.json` | none | `tests/task-evidence-graph-contract.test.mjs` | `node --test tests/task-evidence-graph-contract.test.mjs` | Invalid graph edges block. |
| P04-2 | `tests/fixtures/harness-control-plane/memory-gates/ontology-invalid.jsonl` | `scripts/ontology-constraint-validate.mjs`, `schemas/ontology-constraint.schema.json` if compatible | `tests/ontology-constraint-contract.test.mjs` | `node --test tests/ontology-constraint-contract.test.mjs` | Invalid constraints block. |
| P04-3 | `schemas/memory-control-plane-gate.schema.json` | `scripts/verification-plane.mjs`, `scripts/lib/verification-plane.mjs` | `tests/verification-plane-contract.test.mjs` | `node --test tests/verification-plane-contract.test.mjs` | Memory gate result is evidence-backed. |
| P04-4 | none | `docs/public/roadmaps/harness-control-plane-modernization/09-memory-promotion-knowledge-and-decision-ledger-v2.md` only if a concrete gap is proven | `tests/memory-promotion-contract.test.mjs` | `node --test tests/memory-promotion-contract.test.mjs` | Baseline promotion behavior remains intact. |

## Verification Plan

- [ ] `node --test tests/verification-plane-contract.test.mjs`
- [ ] `node --test tests/memory-promotion-contract.test.mjs`
- [ ] `npm test`
- [ ] Ontology validator fixture for invalid/stale/superseded/evidence-free records.

## Completion Evidence

- Task/evidence graph schema and fixtures.
- Memory gate schema and verification output.
- Narrow Phase 09 amendment note or explicit no-change decision.
- Review confirmation that memory gates block claims but do not replace completion authority.

## Handoff Notes

Phase 05 should consume failure and memory-gate results as eval candidates only. It must not turn a repeated-failure pattern into procedural memory until replay, review, rollback, and scope-owner gates pass.
