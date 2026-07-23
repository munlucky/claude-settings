# Kernel Finalization Authority Aggregate Refactor 마스터 플랜 v1

## Scope Status

Status: `prep-phase-required`

본 패키지는 개별 merge blocker를 반복 보수하는 계획이 아니다. Completion, knowledge review, knowledge commit, projection, Git closeout에 분산된 authority를 하나의 `Finalization Aggregate`와 하나의 atomic authority transaction으로 재구성하는 구조 교체 계획이다.

## Source Baseline

- `skills/moonshot-plan-writer/SKILL.md` — plan package, phase metadata, review 및 evidence 계약
- `skills/moonshot-plan-writer/references/plan-package-contract.md` — tracked-source package와 closure gate
- `skills/moonshot-plan-writer/references/independent-review-loop.md` — 독립 review sidecar와 parent-owned edit 경계
- `scripts/kernel/control-plane.mjs` — 현재 finalization orchestration
- `scripts/kernel/state-store.mjs` — 현재 run/completion/knowledge persistence와 SQLite schema
- `scripts/kernel/knowledge/candidate-review.mjs` — 현재 candidate/ontology/evidence review
- `scripts/kernel/knowledge/commit.mjs` — 현재 knowledge transaction과 projection
- `scripts/kernel/knowledge/context-load.mjs` — 현재 SQLite/JSONL dual read path
- `scripts/kernel/git/closeout.mjs` — 현재 Git commit/push/retry lifecycle
- `scripts/kernel/git/staging-policy.mjs` — 현재 staging path policy
- `bin/moon-relay-kernel.mjs` — public CLI surface
- `package.json` — repository-sourced verification commands

## Objective

다음 runtime contract를 단일 설계로 보장한다.

```text
PROVE
→ PREPARE FINALIZATION
→ RESOLVE APPROVAL / VERIFICATION BLOCKERS
→ ATOMIC AUTHORITY COMMIT
→ DERIVED KNOWLEDGE PROJECTION
→ GIT CLOSEOUT OUTBOX DELIVERY
```

핵심 결과:

1. `finalizeRun()` 외 public API는 completion decision을 생성하지 못한다.
2. readiness가 blocked이면 run은 `PROVE`에 남고 추가 proof·approval 후 재개할 수 있다.
3. candidate, evidence binding, approval, ontology obligation, review receipt가 하나의 aggregate로 결합된다.
4. completion decision, canonical knowledge records, revision CAS, knowledge receipt, finalization authority receipt가 하나의 SQLite transaction에서 전부 또는 전무로 확정된다.
5. runtime knowledge read authority는 SQLite 하나이며 JSON/JSONL은 삭제 후 재생성 가능한 derived projection이다.
6. Git closeout은 authority transaction과 분리된 outbox delivery이며 실패 후 같은 commit SHA로 복구한다.
7. legacy low-level mutation API와 mock-only blocker tests를 제거한다.

## Non-Goals

- Relay runtime-state DB와 Kernel DB를 통합하지 않는다.
- live account-root/profile 설치를 변경하지 않는다.
- 기존 프로젝트 지식을 자동 재분류하거나 대규모 데이터 migration하지 않는다.
- Git closeout 실패를 completion authority 실패로 되돌리지 않는다.
- JSONL을 runtime authority로 유지하지 않는다.
- 병렬 phase 실행을 도입하지 않는다. 모든 Phase는 authority 경계 변경 때문에 순차 실행한다.

## Execution Metadata

```yaml
executionMetadata:
  projectId: "munlucky-moonshot-relay"
  branch: "plan/kernel-project-knowledge-lifecycle"
  planRootMode: "tracked_source_design"
  planRoot: "docs/public/roadmaps/kernel-finalization-authority-aggregate-refactor-2026-07-23"
  sourceBaselineCommit: "ad8fa53488dbd79766b993c2113454eb1379b7e8"
  implementationStarted: false
  executionAuthority: "moonshot-phase-runner after Phase 01 preflight"
```

## Architecture Package

```yaml
architecturePackage:
  status: ready_for_preflight_review
  designAuthority: FINALIZATION_AUTHORITY_AGGREGATE_DESIGN.md
  traceability: TRACEABILITY_MATRIX.md
  selectedADRs:
    - ADR/ADR-0001-finalization-aggregate-single-authority.md
    - ADR/ADR-0002-sqlite-runtime-authority-derived-projections.md
    - ADR/ADR-0003-git-closeout-outbox-delivery.md
  review: ARCHITECTURE_REVIEW.md
  handoff: ARCHITECTURE_HANDOFF.json
  specTestObligations: SPEC_TEST_OBLIGATIONS.md
```

## Adoption Surface Classification

```yaml
adoptionSurface:
  schemaVersion: 1
  policySourcePaths:
    - AGENTS.md
    - skills/moonshot-plan-writer/SKILL.md
    - skills/moonshot-plan-writer/references/plan-package-contract.md
    - skills/moonshot-plan-writer/references/independent-review-loop.md
    - package/package-contract.yaml
    - package.json
    - schemas/verification.contract.yaml
  surfaces:
    - id: finalization-source
      category: source_only
      plannedMutation: scripts/kernel/finalization, knowledge, persistence facade, tests and docs
      controlledAdoptionPhase: "02-05"
      liveMutationPolicy: allowed_with_policy_gate
      policyGateRefs:
        - package.json#scripts.test:kernel
        - package.json#scripts.test
      requiredEvidenceSlots:
        - independent_review
        - targeted_tests
        - full_regression
        - git_closeout_parity
      concreteGateCommands:
        source: project_policy
        commands:
          - npm run test:kernel
          - npm test
          - node scripts/harness-surface-report.mjs check
    - id: runtime-state-schema
      category: data_or_state_migration
      plannedMutation: additive Kernel SQLite schema and controlled legacy facade retirement
      controlledAdoptionPhase: "02-04"
      liveMutationPolicy: dry_run_only
      policyGateRefs:
        - schemas/verification.contract.yaml
        - package.json#scripts.test:kernel
      requiredEvidenceSlots:
        - disposable_runtime_home_preflight
        - transaction_rollback
        - multi_connection_occ
        - restart_recovery
        - migration_compatibility
      concreteGateCommands:
        source: phase_plan
        commands:
          - node --test tests/kernel-finalization-aggregate-*.test.mjs
    - id: kernel-cli-package
      category: package_runtime_payload
      plannedMutation: public CLI routes and package test inventory only
      controlledAdoptionPhase: "05"
      liveMutationPolicy: controlled_phase_only
      policyGateRefs:
        - package/package-contract.yaml
        - package.json#scripts.test:package
      requiredEvidenceSlots:
        - package_verification
        - installed_package_doctor
        - rollback_or_recovery_evidence
      concreteGateCommands:
        source: project_policy
        commands:
          - npm run test:package
    - id: git-delivery
      category: external_deployment_or_service
      plannedMutation: production Git closeout orchestration; tests use disposable local repositories and bare remotes
      controlledAdoptionPhase: "05"
      liveMutationPolicy: dry_run_only
      policyGateRefs:
        - scripts/kernel/git/staging-policy.mjs
        - package.json#scripts.test:kernel
      requiredEvidenceSlots:
        - local_bare_remote_retry
        - explicit_sha_push
        - index_cleanliness
        - unselected_worktree_preservation
      concreteGateCommands:
        source: phase_plan
        commands:
          - node --test tests/kernel-git-closeout-outbox.test.mjs tests/kernel-git-index-postcondition.test.mjs
  unresolvedPolicyGaps: []
```

## Plan Package Readiness

```yaml
planPackageReadiness:
  mode: prep_phase_required
  selectedMasterPlan: 00-master-plan-v1.ko.md
  selectedPhaseDocs:
    - 01-baseline-authority-boundary-v1.ko.md
    - 02-finalization-aggregate-prepare-v1.ko.md
    - 03-atomic-authority-transaction-v1.ko.md
    - 04-sqlite-runtime-knowledge-projection-v1.ko.md
    - 05-git-outbox-invariants-promotion-v1.ko.md
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: classify_before_edit
  runtimePointerAction: none
  readinessDecision: runnable_after_phase_01
  blockingPreflightItems:
    - confirm no parallel implementation remains active on the same owned paths
    - obtain one independent blocker-confirmation review after package publication
    - freeze baseline tests and authority-row counts before code mutation
```

## Plan Quality Loop

```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 1
  isolationMode: unavailable
  maxIterations: 2
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.88
  ambiguityScore: 0.18
  decision: revise
  degradedReason: connector session cannot create an isolated reviewer runtime
  latestReview: planning-loop/plan-quality-review-iter-01.yaml
  blockingFindings:
    - Phase 01 must obtain an independent blocker-confirmation review before implementation
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

## Phase Index

| Phase | Title | Plan File | Depends On | Execution |
|---|---|---|---|---|
| 01 | Baseline and Authority Boundary Freeze | `01-baseline-authority-boundary-v1.ko.md` | - | sequential |
| 02 | Finalization Aggregate Prepare | `02-finalization-aggregate-prepare-v1.ko.md` | 01 | sequential |
| 03 | Atomic Authority Transaction | `03-atomic-authority-transaction-v1.ko.md` | 02 | sequential |
| 04 | SQLite Runtime Knowledge and Derived Projection | `04-sqlite-runtime-knowledge-projection-v1.ko.md` | 03 | sequential |
| 05 | Git Outbox, Invariant Tests, Legacy Removal and Promotion | `05-git-outbox-invariants-promotion-v1.ko.md` | 04 | sequential |

## Execution Order Notes

- Phase 01은 구현 Phase가 아니라 authority inventory, public API freeze, independent review, baseline evidence 생성 Phase다.
- Phase 02에서 blocker를 계산하는 재실행 가능한 prepare path를 먼저 완성한다. `CLOSE` 및 completion write는 이 Phase에서 금지한다.
- Phase 03에서 authority transaction을 교체한 뒤에만 기존 completion/knowledge mutation API를 제거한다.
- Phase 04는 SQLite-only runtime read를 적용하며 projection failure가 runtime lifecycle을 차단하지 않음을 증명한다.
- Phase 05에서 Git outbox를 연결하고, 모든 invariant-based integration test 및 package/full regression을 통과한 후 legacy facade를 삭제한다.

## Source Traceability Summary

| Req ID | Requirement | Phase |
|---|---|---|
| FAR-REQ-001 | sole completion authority | 01, 03 |
| FAR-REQ-002 | recoverable prepare/readiness | 02 |
| FAR-REQ-003 | candidate/evidence/approval/obligation aggregate | 02 |
| FAR-REQ-004 | atomic completion and knowledge authority transaction | 03 |
| FAR-REQ-005 | canonical typed knowledge records | 03 |
| FAR-REQ-006 | SQLite-only runtime knowledge reads | 04 |
| FAR-REQ-007 | rebuildable typed projections | 04 |
| FAR-REQ-008 | Git outbox exact-SHA delivery and retry | 05 |
| FAR-REQ-009 | invariant-based real integration tests | 01-05 |
| FAR-REQ-010 | legacy authority API deletion | 05 |

전체 mapping은 `TRACEABILITY_MATRIX.md`를 따른다.

## Required Evidence Slots

- public API and authority writer inventory
- completion/knowledge/finalization row atomicity report
- blocked readiness recoverability fixture
- candidate-evidence-binding foreign-key and stale-evidence fixture
- approval two-step lifecycle fixture
- dynamic obligation resume fixture
- canonical typed record persistence/retrieval fixture
- multi-connection OCC and injected rollback report
- SQLite-only context/ontology read report with deleted projections
- projection rebuild equivalence report
- Git outbox commit-created/push-failed/retry report
- Git HEAD/index/worktree postcondition report
- `npm run test:kernel`
- `npm run test:package`
- `npm test`
- `node scripts/harness-surface-report.mjs check`
- `node scripts/spec-test-obligations.mjs validate --json`

## Promotion Gates

Hard gates:

- completion decision public writer 수 1
- readiness blocked 상태에서 run state `PROVE` 유지율 100%
- committed knowledge record 중 candidate/evidence binding 누락 0
- completion/knowledge/finalization atomicity 위반 0
- runtime JSONL authority read 0
- projection 삭제 후 rebuild parity 100%
- Git closeout 후 selected path, index, HEAD 불일치 0
- retry 중 duplicate commit 0
- mock-only blocker gate 0

Quality gates:

- 기존 `npm run test:kernel`, `npm run test:package`, `npm test` 회귀 0
- authority 관련 public method 수 감소
- finalization orchestration에서 low-level persistence 호출 분산 제거
- phase evidence와 traceability row 누락 0

## Phase Completion Checklist

- [ ] Phase 01 — Baseline and Authority Boundary Freeze
- [ ] Phase 02 — Finalization Aggregate Prepare
- [ ] Phase 03 — Atomic Authority Transaction
- [ ] Phase 04 — SQLite Runtime Knowledge and Derived Projection
- [ ] Phase 05 — Git Outbox, Invariant Tests, Legacy Removal and Promotion

## Completion Rule

전체 작업 완료는 다음 조건을 모두 만족할 때만 선언한다.

```text
prepareStatus = ready
completionStatus = accepted
knowledgeStatus = committed | no_change
authorityTransactionStatus = committed
projectionStatus = completed | recoverable_failure
gitDeliveryStatus = completed | skipped
legacyAuthoritySurfaceCount = 0
```

문서 생성, test count 증가, receipt 존재만으로 완료를 선언하지 않는다. 모든 invariant는 실제 SQLite connection, 실제 disposable Git repository, 실제 local bare remote를 사용한 integration evidence로 검증한다.
