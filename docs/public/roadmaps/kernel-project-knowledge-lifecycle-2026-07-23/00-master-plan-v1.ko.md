# Moon Relay Kernel 프로젝트 지식 라이프사이클 마스터 플랜 v1

## Scope Status

Status: `implementation-ready-design-plan`

## Objective

Moon Relay Kernel이 모든 작업을 시작할 때 프로젝트별 아키텍처, 정책, 검증된 사실, 지식 그래프, 온톨로지 제약, 암묵지 요약을 안전하게 불러오고, 작업 종료 시 fresh evidence로 검증된 변화만 프로젝트 지식에 반영하도록 한다.

Git closeout이 요청된 작업은 Relay의 `commit-moonshot` 계약을 Kernel 전용으로 이식하여 지식 갱신, 안전한 staging, commit, push, 원격 parity 증거까지 `CLOSE` 단계에서 처리한다. 단, Git commit/push는 사용자 명시 요청 또는 task contract의 명시적 승인 없이는 실행하지 않으며 Kernel completion authority를 생성하거나 대체하지 않는다.

## Target Lifecycle

```text
REQUEST
  → PROJECT IDENTIFY
  → KNOWLEDGE SNAPSHOT
  → FRAME
  → SHAPE
  → SLICE / SCHEDULE (조건부)
  → EXECUTE
  → KNOWLEDGE REVIEW
  → PROVE
  → ACCEPTED COMPLETION
  → PROJECT KNOWLEDGE COMMIT
  → GIT CLOSEOUT (명시 요청 시)
  → CLOSE
```

## Core Outcomes

- Kernel 전용 `projectId` resolver와 account-root project knowledge namespace
- stage-scoped, path-aware, objective-aware knowledge retrieval
- prompt-safe `projectKnowledgeContext`와 immutable context receipt
- architecture/ADR/ASR/domain/component/API 관계 조회
- ontology constraint 적용 및 변경 전후 검증
- 작업 중 발견을 즉시 장기기억으로 쓰지 않는 candidate lifecycle
- `observe → stage → verify → commit/supersede/archive` 상태 전이
- accepted completion 이후에만 semantic/graph/ontology knowledge write 허용
- 작업 시작/종료 knowledge revision 및 provenance 추적
- Kernel 전용 `commit-moonshot` closeout adapter
- staging denylist, generated/runtime state 제외, commit/push receipt, remote parity 확인
- Relay runtime/state/profile과 완전 격리

## Non-Goals

- Relay runtime-state DB 또는 MemoryGraph namespace를 Kernel에서 공유하지 않는다.
- 기존 Relay 프로젝트 지식을 자동 마이그레이션하지 않는다.
- raw graph, ontology dump, transcript, runtime log, secret-like value를 프롬프트에 넣지 않는다.
- 한 번의 작업 관찰을 즉시 정책·온톨로지·검증 사실로 승격하지 않는다.
- Git commit/push를 작업 완료의 필수 조건이나 completion authority로 취급하지 않는다.
- 모든 작업에 전체 프로젝트 색인, 전체 그래프 조회, 다중 에이전트 리뷰를 강제하지 않는다.
- 초기 단계에서 전역 하네스 지식 승격을 자동화하지 않는다.

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: implementation-ready-design-plan
  projectId: munlucky-moonshot-relay
  branch: plan/kernel-project-knowledge-lifecycle
  sourceRoadmapRoot: docs/public/roadmaps/kernel-project-knowledge-lifecycle-2026-07-23
  selectedMasterPlan: 00-master-plan-v1.ko.md
  selectedPhaseDocs:
    - 01-baseline-identity-and-contracts-v1.ko.md
    - 02-knowledge-store-and-context-load-v1.ko.md
    - 03-architecture-ontology-tacit-retrieval-v1.ko.md
    - 04-post-work-candidate-review-v1.ko.md
    - 05-knowledge-commit-and-supersession-v1.ko.md
    - 06-commit-moonshot-kernel-closeout-v1.ko.md
    - 07-package-profile-adoption-e2e-v1.ko.md
  architecturePackage:
    traceability: TRACEABILITY_MATRIX.md
    obligations: SPEC_TEST_OBLIGATIONS.md
    handoff: ARCHITECTURE_HANDOFF.json
    review: ARCHITECTURE_REVIEW.md
    adrs:
      - ADR/ADR-0001-kernel-project-knowledge-isolation.md
      - ADR/ADR-0002-completion-gated-knowledge-write.md
      - ADR/ADR-0003-explicit-git-closeout-boundary.md
  reviewArtifacts:
    - planning-loop/plan-quality-review-iter-01.yaml
  readinessDecision: runnable_after_phase-01-preflight
```

## Product and Authority Boundaries

### Authority hierarchy

1. Kernel runtime-state DB: run, stage, verification, completion decision authority
2. Repository source and authoritative project documents: policy/architecture source of truth
3. Verified project knowledge records: compact reusable project knowledge
4. Derived graph/index: retrieval acceleration and impact hints only
5. Episodic observations: quarantined candidates, non-authoritative
6. Git commit/push receipts: delivery evidence only

### Completion and knowledge write

- `PROVE`에서 fresh verification을 기록한다.
- `assessCompletion(..., commitDecision: true)`가 `accepted`를 반환하기 전에는 verified knowledge write를 금지한다.
- accepted 이후에도 candidate별 source/evidence/provenance 검증을 통과해야 한다.
- knowledge write 실패는 completion decision을 소급 변경하지 않지만 `CLOSE`를 `closed_with_knowledge_warning`으로 기록한다.
- strict knowledge task는 write 실패를 closeout blocker로 구성할 수 있다.

### Git closeout

- `gitCloseout.requested=true` 또는 사용자 명시 요청에서만 실행한다.
- knowledge closeout receipt가 먼저 생성되어야 한다.
- generated profile, runtime DB, raw knowledge store, secret-like 파일은 staging denylist로 차단한다.
- commit 및 push 결과는 Kernel event/receipt로 기록하되 completion authority가 아니다.

## Surface Classification

| Surface | Classification | Adoption boundary |
|---|---|---|
| `scripts/kernel/knowledge/**`, `schemas/kernel.knowledge.*`, `skills/kernel-project-*` | `source_only` | Phase 01~06 |
| `scripts/kernel/control-plane.mjs`, `scripts/kernel/state-store.mjs`, `bin/moon-relay-kernel.mjs` | `source_only` + runtime contract | targeted tests 후 적용 |
| `package/kernel/**`, `catalog/kernel-skills.*` | `package_runtime_payload` | Phase 07 package dry-run 이후 |
| `~/.moon-relay-kernel/state/projects/<projectId>/knowledge/**` | `data_or_state_migration` | 신규 namespace만 생성, Relay migration 금지 |
| Kernel runtime DB schema | `data_or_state_migration` | additive migration + rollback/compat evidence 필요 |
| Claude/Codex/Qwen/Antigravity Kernel profiles | `installed_profile_or_account_root` | Phase 07 disposable home 이후 |
| GitHub commit/push | `external_deployment_or_service` | 명시 요청, branch protection 및 remote parity 확인 |

## Policy Sources

- `AGENTS.md`
- `kernel/product.yaml`
- `kernel/context-policy.yaml`
- `package/kernel/manifest.json`
- `package/package-contract.yaml`
- `schemas/verification.contract.yaml`
- `skills/moonshot-plan-writer/SKILL.md`
- `skills/moonshot-plan-writer/references/plan-package-contract.md`
- `skills/moonshot-plan-writer/references/independent-review-loop.md`
- `skills/commit-moonshot/SKILL.md`
- `scripts/kernel/control-plane.mjs`
- `scripts/kernel/state-store.mjs`
- `scripts/knowledge-records.mjs`
- `scripts/knowledge-context-build.mjs`
- `scripts/architecture-knowledge-resolve.mjs`
- `scripts/knowledge-improvement-lifecycle.mjs`

## Phase Inventory

| Phase | Title | Depends On | Parallel | Primary surfaces |
|---|---|---|---|---|
| 01 | Baseline, Identity, Contracts | - | no | source_only |
| 02 | Knowledge Store and Context Load | 01 | no | source_only, data/state |
| 03 | Architecture, Ontology, Tacit Retrieval | 02 | no | source_only |
| 04 | Post-work Candidate Review | 02, 03 | no | source_only |
| 05 | Knowledge Commit and Supersession | 04 | no | source_only, data/state |
| 06 | commit-moonshot Kernel Closeout | 05 | no | source_only, external Git optional |
| 07 | Package, Profile, Adoption, E2E | 01~06 | no | package/profile/account-root |

## Required Evidence Slots

- project identity determinism and alias/path collision tests
- Relay/Kernel namespace isolation and no-migration tests
- typed knowledge record schema and transition tests
- atomic knowledge revision update and crash recovery tests
- stage/objective/path-scoped retrieval tests
- context token budget, prompt purity, redaction, stale/degraded tests
- architecture/ontology blocking constraint tests
- candidate extraction, dedupe, evidence binding, rejection tests
- accepted-completion-gated write tests
- supersession cycle and cross-project mutation rejection tests
- knowledge closeout receipt digest and revision lineage tests
- explicit Git closeout approval tests
- staging denylist and generated/runtime-state exclusion tests
- commit failure, push failure, remote parity, retry/idempotency tests
- package payload parity and profile discovery isolation tests
- disposable home install/doctor/uninstall/rollback evidence
- `npm run test:kernel`
- `npm run test:package`
- `npm run test:routing`
- `npm run test:eval`
- `npm run test:lab`
- full `npm test`

## Promotion Gates

Hard gates:

- Relay state/profile/runtime contamination 0
- raw graph/ontology/log/transcript/secret prompt leak 0
- completion 이전 verified knowledge write 0
- unverified observation의 semantic/ontology 승격 0
- Git closeout 무승인 실행 0
- staging denylist 위반 0
- supersession cycle 및 cross-project overwrite 0
- 필수 evidence 누락 0

Quality gates:

- FRAME context pack 생성 추적률 100%
- accepted task knowledge closeout receipt 생성률 100%
- knowledge revision start/close lineage 추적률 100%
- context budget 초과 시 deterministic omission 100%
- Git closeout 요청 작업 remote parity 판정률 100%
- 대표 Kernel 작업 성공률 기존 Kernel baseline 대비 회귀 없음

## Execution Rule

각 Phase는 독립적인 fresh verification과 evidence receipt를 생성한다. Phase 07 전에는 live account-root profile을 변경하지 않는다. 전체 기능 완료는 Kernel E2E에서 `load → execute → prove → accepted → knowledge commit → optional Git closeout → close`가 재현되고 package/profile isolation과 rollback이 통과한 뒤에만 인정한다.