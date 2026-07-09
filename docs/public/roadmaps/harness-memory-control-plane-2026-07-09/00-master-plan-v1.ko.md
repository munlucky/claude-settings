# Harness Memory Control Plane - Master Plan v1

Status: draft-after-independent-review-iter-01
Last-Reviewed: 2026-07-09

이 계획은 업로드 리서치와 현재 `moonshot-relay` 소스 상태를 기준으로, 메모리/지식그래프/온톨로지를 단순 검색 보조가 아니라 `requirements -> design -> plan -> execute -> verify -> score -> replan` 전 과정을 통제하는 하네스 상태 제어면으로 확장하기 위한 작업 패키지다.

이 문서는 기존 `docs/public/roadmaps/harness-control-plane-modernization/09-memory-promotion-knowledge-and-decision-ledger-v2.md`를 대체하지 않는다. Phase 09가 "오염된 장기 메모리 승격 방지"를 다루는 좁은 memory-promotion phase라면, 이 패키지는 phase 04 context serving, phase 08 eval regression, phase 09 promotion ledger, phase 12 observability를 연결하는 cross-phase implementation roadmap이다.

## Source Baseline

- `AGENTS.md` (역할: source/runtime boundary, public roadmap policy, generated-state exclusion)
- `docs/public/roadmaps/harness-control-plane-modernization/00-master-plan-v2.md` (역할: control-plane modernization source scope)
- `docs/public/roadmaps/harness-control-plane-modernization/09-memory-promotion-knowledge-and-decision-ledger-v2.md` (역할: memory promotion and decision ledger baseline)
- `docs/public/project-knowledge-plane.md` (역할: observe/stage/verify/promote/supersede/archive lifecycle)
- `docs/public/guidelines/document-memory-policy.md` (역할: durable memory vs raw generated state policy)
- `docs/public/guidelines/memorygraph-workflow.md` (역할: MemoryGraph generated-state and promotion policy)
- `schemas/knowledge-contract.schema.json` (역할: compact prompt knowledge contract)
- `schemas/memory-promotion-ledger.schema.json` (역할: promotion decision schema)
- `schemas/ontology-constraint.schema.json` (역할: executable ontology constraint record schema)
- `scripts/knowledge-context-build.mjs` (역할: stage-scoped projectKnowledgeContext builder)
- `scripts/awtl-memory-promotion.mjs` and `scripts/lib/awtl-memory-promotion.mjs` (역할: replay-backed memory candidate promotion)
- `scripts/ontology-constraint-validate.mjs` (역할: ontology constraint validation helper)
- `scripts/plan-graph-validate.mjs` (역할: plan graph / write-set drift validation)
- `tests/knowledge-context-build-contract.test.mjs` and `tests/memory-promotion-contract.test.mjs` (역할: current regression boundary)
- Uploaded research: `C:\Users\moon\.codex\attachments\793ab7cf-c7f6-4cce-ace7-0ac56287513c\pasted-text.txt` (역할: 2026 memory-harness strategy synthesis)

## External Research Basis

External sources justify direction only. They do not override local runtime contracts.

- M* argues that memory design should be task-specific and include schema, storage logic, and agent instructions rather than a fixed universal memory store.
- Graphiti/Zep supports the directional choice of temporal context graphs, provenance, validity windows, and hybrid retrieval.
- Neo4j Agent Memory supports the directional choice of short-term, long-term, and reasoning memory linked in a graph with audit edges.
- OpenAI Agents SDK Sessions supports the distinction between conversation/session history and explicit context injection.
- MCP supports tool/resource boundaries, human consent, data access, and safety controls around external memory tools.

## Goal

Build a source-roadmap package that prepares implementation of a verified memory graph control plane:

- evidence-first episode ledger and memory claim provenance;
- stage-scoped retrieval and prompt-safe context packs;
- task/evidence graph and ontology constraints that block invalid memory writes and stale fact use;
- a narrow Phase 09 amendment only where existing promotion ledger contracts have gaps;
- eval, failure-memory, and procedural-memory loops that create candidates without automatic promotion;
- score, observability, package, account-root, and optional backend rollout gates.

## Non-Goals

- Do not select or install a production graph backend in this plan package.
- Do not write live MemoryGraph/account-root memory from planning.
- Do not copy raw MemoryGraph, KG, ontology dumps, logs, transcripts, sqlite state, browser traces, or secret-like strings into source docs.
- Do not treat memory, projectKnowledgeContext, or compact summaries as completion authority.
- Do not collapse project-specific lessons into harness-wide memory without cross-project evidence, replay, review, rollback, and scope ownership.

## Execution Metadata

```yaml
executionMetadata:
  projectId: "munlucky-moonshot-relay"
  planRootMode: "tracked_source_design"
  planRoot: "docs/public/roadmaps/harness-memory-control-plane-2026-07-09"
  accountPlanningRoot: "C:/Users/moon/.moonshot-relay/state/projects/munlucky-moonshot-relay/planning/packages"
  sourceDesignReason: "This roadmap defines durable public source strategy for the harness itself and cross-references existing docs/public roadmaps."
  currentWorktreeStatusAtDraft: "git status --short returned no paths before edits"
  packageGitStatusAfterCreation: "untracked_not_staged; staging/commit was not requested in this planning task"
```

## Adoption Surface Classification

```yaml
adoptionSurface:
  schemaVersion: 1
  policySourcePaths:
    - "AGENTS.md"
    - "schemas/verification.contract.yaml"
    - "docs/public/guidelines/document-memory-policy.md"
    - "docs/public/guidelines/memorygraph-workflow.md"
    - "docs/public/project-knowledge-plane.md"
    - "package.json"
  surfaces:
    - id: "memory-control-plane-source"
      category: "source_only"
      plannedMutation: "Create or update docs, schemas, scripts, tests, and fixtures under tracked source."
      controlledAdoptionPhase: "01-05"
      liveMutationPolicy: "allowed_with_policy_gate"
      policyGateRefs:
        - "AGENTS.md Source Boundaries"
        - "package.json scripts.test"
      requiredEvidenceSlots:
        - "independent_review"
        - "targeted_tests"
        - "plan_graph_or_markdown_compatibility"
        - "git_closeout_parity"
      concreteGateCommands:
        source: "project_policy"
        commands:
          - "npm test"
          - "node --test tests/knowledge-context-build-contract.test.mjs tests/memory-promotion-contract.test.mjs"
          - "$docs=@('docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md') | ConvertTo-Json -Compress; node scripts/plan-graph-validate.mjs --markdown-phase-docs-json $docs --json"
    - id: "memory-control-plane-package-runtime"
      category: "package_runtime_payload"
      plannedMutation: "Future package payload inclusion for new scripts, schemas, docs, and fixtures after source implementation."
      controlledAdoptionPhase: "05"
      liveMutationPolicy: "controlled_phase_only"
      policyGateRefs:
        - "package.json files"
        - "package.json scripts.test:package"
      requiredEvidenceSlots:
        - "build_or_package_verification"
        - "package_materialization_diff"
        - "generated_state_exclusion"
      concreteGateCommands:
        source: "project_policy"
        commands:
          - "npm run test:package"
    - id: "memory-control-plane-installed-account-root"
      category: "installed_profile_or_account_root"
      plannedMutation: "Future install/account-root adoption for memory control-plane helpers and policy docs."
      controlledAdoptionPhase: "05"
      liveMutationPolicy: "controlled_phase_only"
      policyGateRefs:
        - "AGENTS.md Runtime Contract"
        - "docs/public/installer-usage.md"
        - "missing-policy: exact install parity command must be confirmed at implementation time"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "post_adoption_verification"
        - "rollback_or_recovery_evidence"
        - "git_closeout_parity"
      concreteGateCommands:
        source: "missing_policy"
        commands: []
    - id: "memory-control-plane-external-graph-backend"
      category: "external_deployment_or_service"
      plannedMutation: "Optional future Graphiti, Neo4j, or MCP memory backend integration."
      controlledAdoptionPhase: "not-in-v1"
      liveMutationPolicy: "forbidden"
      policyGateRefs:
        - "missing-policy: external backend selection, secrets, PII, migration, and rollback policy"
      requiredEvidenceSlots:
        - "architecture_decision"
        - "security_privacy_review"
        - "migration_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommands:
        source: "missing_policy"
        commands: []
    - id: "memory-control-plane-data-state"
      category: "data_or_state_migration"
      plannedMutation: "Future runtime DB/memory ledger migration for episode, claim, retrieval, and score records."
      controlledAdoptionPhase: "02-05"
      liveMutationPolicy: "dry_run_only until migration policy exists"
      policyGateRefs:
        - "scripts/runtime-state.mjs migration behavior"
        - "schemas/memory-promotion-ledger.schema.json"
        - "missing-policy: explicit migration rollback manifest for new memory tables"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "targeted_tests"
        - "rollback_or_recovery_evidence"
        - "stale_state_projection_evidence"
      concreteGateCommands:
        source: "missing_policy"
        commands: []
  unresolvedPolicyGaps:
    - "Exact account-root install parity command must be confirmed from current installer policy when implementation starts."
    - "External graph backend selection and secret/PII handling require an ADR before any live service adoption."
    - "New runtime-state memory tables require migration rollback policy before non-dry-run state mutation."
```

## Phase Index

| Phase | Title | Plan File | Dependencies |
|---|---|---|---|
| 01 | Current Memory Plane Baseline and Scope Freeze | `01-current-memory-plane-baseline-v1.ko.md` | none |
| 02 | Evidence Episode Ledger and Memory Claim Contract | `02-evidence-episode-ledger-v1.ko.md` | 01 |
| 03 | Stage-Scoped Retrieval and Prompt Context Packs | `03-stage-scoped-retrieval-and-context-packs-v1.ko.md` | 01, 02 |
| 04 | Task Evidence Graph, Ontology Validation, and Verify Gates | `04-task-evidence-graph-ontology-verify-gates-v1.ko.md` | 02, 03 |
| 05 | Eval Failure and Procedural Memory Candidates | `05-eval-failure-and-procedural-memory-v1.ko.md` | 02, 03, 04 |
| 06 | Score Observability, Package, and Account-Root Rollout | `06-score-observability-package-rollout-v1.ko.md` | 02, 03, 04, 05 |

## Execution Order

- Phase 01 is mandatory first because this repository already has memory/knowledge/ontology code; implementation must freeze current truth before adding new tables or commands.
- Phases 02 and 03 can proceed in the same implementation wave only after Phase 01 records the exact current boundary.
- Phase 04 depends on both claim provenance and stage-scoped retrieval, because ontology validation must know what is allowed to enter prompts and what is only evidence/state.
- Phase 05 turns failure traces and eval replay into candidates only. It must not auto-promote procedural memory.
- Phase 06 is controlled adoption. It must not mutate package payload, installed profile, live account root, or external graph backends until source tests, eval evidence, and review evidence are complete.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | Current truth baseline owns cross-cutting inventory. |
| wave-2 | 02, 03 | conditional parallel | Parallel only if write sets stay disjoint: ledger/schema/runtime state vs context-builder/retrieval policy. |
| wave-3 | 04 | sequential | Depends on outputs of 02 and 03. |
| wave-4 | 05 | sequential | Depends on task/evidence graph and verify gates. |
| wave-5 | 06 | sequential | Controlled adoption, observability, package/account-root evidence. |

## Source Traceability Matrix

| Req ID | AC ID | Source | Requirement Summary | Phase | Status |
|---|---|---|---|---|---|
| REQ-MEM-001 | AC-MEM-001 | uploaded research section 1, M* | Memory must be task/stage-specific, not a universal fixed store. | 01, 03 | mapped |
| REQ-MEM-002 | AC-MEM-002 | uploaded research sections 2, 8 | Memory facts must have evidence, provenance, confidence, validity, and promotion gates. | 02 | mapped |
| REQ-MEM-003 | AC-MEM-003 | uploaded research sections 3, 4 | Graph/ontology constraints must represent requirement/design/plan/test/failure/evidence relationships and block invalid writes. | 04 | mapped |
| REQ-MEM-004 | AC-MEM-004 | uploaded research section 5 | Each harness stage must have read, write, and verify policies. | 03, 04 | mapped |
| REQ-MEM-005 | AC-MEM-005 | uploaded research section 6 | Memory quality must affect verify/score and block stale or unauthorized memory use. | 04, 06 | mapped |
| REQ-MEM-006 | AC-MEM-006 | uploaded research sections 7, 10 | MVP should remain file-first, then optional graph backend, then ontology expansion. | 06 | mapped |
| REQ-MEM-007 | AC-MEM-007 | existing Phase 09 | Memory cannot become completion authority and promotion requires review/replay/rollback. | 02, 05, 06 | mapped |
| SCN-MEM-001 | AC-MEM-008 | document-memory-policy | Raw logs, transcripts, graph dumps, and sqlite state stay out of source docs and prompts. | 01, 03 | mapped |
| SCN-MEM-002 | AC-MEM-009 | knowledge-context-build | Prompt context must remain compact and stage-scoped even when richer context packs exist. | 03 | mapped |
| SCN-MEM-003 | AC-MEM-010 | memory-promotion tests | Rollback must supersede memory without deleting audit history and stale projections must warn. | 02, 06 | mapped |

## Spec-Test Obligations

```yaml
specTestObligations:
  - id: "STO-MEM-REQ-001"
    requirementId: "REQ-MEM-001"
    interface: "docs/public roadmaps and future retrieval policy"
    depth: "contract"
    environment: "source"
    verificationMode: "characterization_first"
    highestPublicSeam: "phase roadmap and retrieval contract docs before runtime mutation"
    commands:
      - "$docs=@('docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md') | ConvertTo-Json -Compress; node scripts/plan-graph-validate.mjs --markdown-phase-docs-json $docs --json"
    evidencePaths:
      - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/planning-loop/plan-quality-review-iter-02.yaml"
  - id: "STO-MEM-REQ-002"
    requirementId: "REQ-MEM-002"
    interface: "runtime-state memory claim / promotion ledger"
    depth: "unit_contract"
    environment: "source temp runtime DB"
    verificationMode: "tdd_red_green"
    highestPublicSeam: "scripts/runtime-state.mjs CLI and tests/memory-promotion-contract.test.mjs"
    commands:
      - "node --test tests/memory-promotion-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-SCN-002"
    requirementId: "SCN-MEM-002"
    interface: "projectKnowledgeContext promptBlock and contextPack"
    depth: "unit_contract"
    environment: "source account-state temp fixtures"
    verificationMode: "tdd_red_green"
    highestPublicSeam: "scripts/knowledge-context-build.mjs"
    commands:
      - "node --test tests/knowledge-context-build-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-REQ-003"
    requirementId: "REQ-MEM-003"
    interface: "task evidence graph and ontology constraints"
    depth: "unit_contract"
    environment: "source fixtures"
    verificationMode: "tdd_red_green"
    highestPublicSeam: "scripts/ontology-constraint-validate.mjs and planned task evidence graph validator"
    commands:
      - "node --test tests/task-evidence-graph-contract.test.mjs tests/ontology-constraint-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-REQ-004"
    requirementId: "REQ-MEM-004"
    interface: "stage-scoped retrieval policy"
    depth: "unit_contract"
    environment: "source account-state fixtures"
    verificationMode: "tdd_red_green"
    highestPublicSeam: "scripts/knowledge-context-build.mjs"
    commands:
      - "node --test tests/knowledge-context-build-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-REQ-005"
    requirementId: "REQ-MEM-005"
    interface: "verification-plane memory gates and score policy"
    depth: "unit_contract"
    environment: "source fixtures"
    verificationMode: "tdd_red_green"
    highestPublicSeam: "scripts/verification-plane.mjs and score policy contract tests"
    commands:
      - "node --test tests/verification-plane-contract.test.mjs tests/score-policy-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-REQ-006"
    requirementId: "REQ-MEM-006"
    interface: "package and rollout gates"
    depth: "integration_contract"
    environment: "source package temp-home"
    verificationMode: "evidence_mandatory"
    seamRationale: "package/account-root adoption crosses source-only boundaries and requires policy-sourced rollout evidence"
    commands:
      - "npm run test:package"
    evidencePaths:
      - "package materialization output"
      - "future temp-home install parity evidence"
  - id: "STO-MEM-REQ-007"
    requirementId: "REQ-MEM-007"
    interface: "memory promotion ledger"
    depth: "unit_contract"
    environment: "source temp runtime DB"
    verificationMode: "characterization_first"
    highestPublicSeam: "scripts/runtime-state.mjs record-memory-promotion and rollback-memory-promotion"
    commands:
      - "node --test tests/memory-promotion-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-SCN-001"
    requirementId: "SCN-MEM-001"
    interface: "prompt-safe context and source-doc generated-state boundary"
    depth: "contract"
    environment: "source"
    verificationMode: "characterization_first"
    highestPublicSeam: "scripts/knowledge-context-build.mjs prompt unsafe omission behavior"
    commands:
      - "node --test tests/knowledge-context-build-contract.test.mjs"
    evidencePaths:
      - "test output"
  - id: "STO-MEM-SCN-003"
    requirementId: "SCN-MEM-003"
    interface: "memory rollback and stale projection"
    depth: "unit_contract"
    environment: "source temp runtime DB"
    verificationMode: "characterization_first"
    highestPublicSeam: "scripts/runtime-state.mjs rollback-memory-promotion"
    commands:
      - "node --test tests/memory-promotion-contract.test.mjs"
    evidencePaths:
      - "test output"
```

Validator command for implementation execution packages that emit sprint/QA/spec obligation docs:

```powershell
node scripts/spec-test-obligations.mjs validate --sprint-contract <SPRINT_CONTRACT.md> --qa-report <QA_REPORT.md> --requirements-traceability <REQUIREMENTS_TRACEABILITY.md> --scenario-matrix <SCENARIO_MATRIX.md> --scorecard <SCORECARD.md> --json
```

This roadmap is a planning package, not a sprint execution package. The command above is mandatory when the follow-on implementation package materializes those execution artifacts.

## Closure Gate Evidence

```yaml
closureGate:
  expectedFiles:
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/00-master-plan-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/planning-loop/plan-quality-review-iter-01.yaml"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/planning-loop/plan-quality-review-iter-02.yaml"
  testPathStatus: "verified after iter-02 parent edits"
  objectiveKeywordSearch:
    command: "rg -n \"memory-control-plane|REQ-MEM|adoptionSurface|surfaceClassifications|missing-policy|Phase 09|score|observability|procedural\" docs/public/roadmaps/harness-memory-control-plane-2026-07-09"
    status: "matches_found"
  markdownCompatibility:
    command: "$docs=@('docs/public/roadmaps/harness-memory-control-plane-2026-07-09/01-current-memory-plane-baseline-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/02-evidence-episode-ledger-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/03-stage-scoped-retrieval-and-context-packs-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/04-task-evidence-graph-ontology-verify-gates-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/05-eval-failure-and-procedural-memory-v1.ko.md','docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md') | ConvertTo-Json -Compress; node scripts/plan-graph-validate.mjs --markdown-phase-docs-json $docs --json"
    observedStatus: "supported"
    phaseCount: 6
  gitTrackingStatus:
    command: "git status --short -- docs/public/roadmaps/harness-memory-control-plane-2026-07-09"
    observedStatus: "untracked_not_staged"
    reason: "The user requested document preparation, not staging or commit."
  missingPolicyGates:
    - "Exact live account-root install parity command must be sourced at implementation time."
    - "External graph backend ADR/security/migration policy remains blocking."
    - "Runtime-state data migration rollback policy remains blocking."
```

## Completion Rules

- This package is complete when all expected files exist, the independent review loop is recorded, per-document review entries are recorded, and accepted review changes are reflected in the docs.
- This package is not execution-complete for source implementation. It prepares implementation work.
- Any future implementation claiming completion must provide source tests, package/runtime evidence when applicable, Harness Lab status, and installed-root parity when account-root adoption is in scope.
