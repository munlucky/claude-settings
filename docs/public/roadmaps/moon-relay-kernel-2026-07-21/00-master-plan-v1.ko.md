# Moon Relay Kernel 구현 마스터 플랜 v1

> **Current implementation note (2026-08-30):** This roadmap remains the
> historical phase plan. The delivered runtime uses the existing Step Ledger
> as its only planning authority; parallel selection is derived and Host
> dispatch is transient, with no persistent Wave replacement lifecycle.

## Scope Status

Status: implementation-ready-design-plan

## Objective

Moonshot Relay의 검증된 저수준 런타임 자산을 선별 재사용하면서, Moon Relay Kernel을 별도 제품 트랙으로 구현한다.

핵심 결과:

- 단일 공개 진입점 `moon-relay-kernel`
- 적응형 워크플로우 `FRAME → SHAPE → SLICE → SCHEDULE → EXECUTE → PROVE → CLOSE`
- stage-scoped context compiler
- 파일 의도 / SQLite 실행 권한 / one-way projection
- T0~T3 위험 기반 proof pipeline
- E0~E2 Evidence Pack
- pinned upstream skill registry
- Relay/Kernel 동시 설치 및 Codex 앱 프로젝트 격리
- 순차 기본, 병렬 선택은 Step Ledger에서 파생하고 Host dispatch는 transient

## Non-Goals

- 초기 단계에서 Relay main을 대체하지 않는다.
- Relay runtime-state DB를 Kernel로 자동 마이그레이션하지 않는다.
- 외부 스킬을 자동 다운로드·자동 적용하지 않는다.
- 모든 작업에 병렬 실행·다중 에이전트·3축 리뷰를 강제하지 않는다.
- 계획 문서 존재를 구현 완료 증거로 취급하지 않는다.
- source 계약 검증 전 `.claude/**`, `.codex/**`, 계정 루트 설치 프로필을 변경하지 않는다.

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: source-roadmap-ready-for-phase-runner
  projectId: munlucky-moonshot-relay
  branch: kernel/moon-relay-kernel
  sourceRoadmapRoot: docs/public/roadmaps/moon-relay-kernel-2026-07-21
  architecturePackage:
    mode: meta_harness_redesign
    design: docs/public/roadmaps/moon-relay-kernel-2026-07-21/MOON_RELAY_KERNEL_FINAL_DESIGN.md
    traceability: docs/public/roadmaps/moon-relay-kernel-2026-07-21/TRACEABILITY_MATRIX.md
    handoff: docs/public/roadmaps/moon-relay-kernel-2026-07-21/ARCHITECTURE_HANDOFF.json
    review: docs/public/roadmaps/moon-relay-kernel-2026-07-21/ARCHITECTURE_REVIEW.md
  selectedMasterPlan: 00-master-plan-v1.ko.md
  selectedPhaseDocs:
    - 01-baseline-and-product-boundary-v1.ko.md
    - 02-runtime-package-isolation-v1.ko.md
    - 03-entrypoint-workflow-context-v1.ko.md
    - 04-state-authority-evidence-v1.ko.md
    - 05-core-skills-upstream-registry-v1.ko.md
    - 06-adaptive-proof-safe-wave-v1.ko.md
    - 07-profile-dogfood-adoption-v1.ko.md
  reviewArtifacts:
    - planning-loop/plan-quality-review-iter-01.yaml
  readinessDecision: runnable_after_phase-01-preflight
```

## Surface Classification

| Surface | Classification | Adoption boundary |
|---|---|---|
| `kernel/**`, `schemas/kernel.*`, `scripts/kernel/**`, `skills/kernel-*` | `source_only` | Phase 01~06에서 구현 가능 |
| `bin/moon-relay-kernel.mjs`, `package/kernel/**` | `package_runtime_payload` | package dry-run과 payload parity 필요 |
| `~/.moon-relay-kernel/**` | `data_or_state_migration` | 신규 상태 생성만 허용, Relay DB migration 금지 |
| Claude/Codex/Qwen profile output | `installed_profile_or_account_root` | Phase 07 전까지 live adoption 금지 |
| Codex 앱 프로젝트/worktree 구성 | `installed_profile_or_account_root` | disposable home 및 샘플 프로젝트 검증 후 적용 |
| upstream GitHub 조회 | `external_deployment_or_service` read-only | update proposal만 생성, write 없음 |

## Policy Sources

- `AGENTS.md`
- `skills/moonshot-plan-writer/SKILL.md`
- `skills/moonshot-plan-writer/references/plan-package-contract.md`
- `skills/moonshot-plan-writer/references/independent-review-loop.md`
- `docs/public/guidelines/external-skill-pattern-transfer.md`
- `docs/public/reference/moonshot-relay-current-architecture/ADR/ADR-0003-runtime-state-completion-authority.md`
- `schemas/verification.contract.yaml`
- `package/package-contract.yaml`
- `package.json`
- `tools/sandbox/policy.mjs`

## Phase Runner Execution Index

| Phase | Title | Depends On | Parallel | Primary surface |
|---|---|---|---|---|
| 01 | Baseline and Product Boundary | - | no | source_only |
| 02 | Runtime and Package Isolation | 01 | no | package_runtime_payload |
| 03 | Entrypoint, Workflow, Context | 01, 02 | no | source_only |
| 04 | State Authority and Evidence | 02, 03 | no | data_or_state_migration design/source |
| 05 | Core Skills and Upstream Registry | 03 | conditional with 04 only if owned paths stay disjoint | source_only |
| 06 | Adaptive Proof and Safe Wave | 04, 05 | no | source_only |
| 07 | Profiles, Dogfood, Adoption | 02, 03, 04, 05, 06 | no | installed_profile_or_account_root |

## Required Evidence Slots

- baseline Relay/Kernal A/B fixture corpus and metric schema
- track/runtime-home/profile/state isolation tests
- package materialization and offline managed-runtime tests
- wrong-harness entrypoint rejection tests
- workflow transition and context receipt tests
- state authority, projection, tamper, no-migration tests
- skill RED/GREEN regression scenarios
- upstream pin/diff/proposal tests
- proof tier and Evidence Pack selection tests
- Safe Wave conflict analysis tests
- profile discovery isolation and uninstall rollback tests
- `npm run test:package`
- `npm run test:routing`
- `npm run test:eval`
- `npm run test:lab`
- full `npm test`

## Spec-Test Obligations

모든 `KRN-REQ-*`, `KRN-SCN-*`는 `SPEC_TEST_OBLIGATIONS.md`에 obligation row를 가진다. 행동 변경은 원칙적으로 `tdd_red_green`, 기존 Relay 동작 보존은 `characterization_first`, 설치·계정 루트 채택은 `evidence_mandatory`를 사용한다.

Validator target:

```bash
node scripts/spec-test-obligations.mjs validate --json
```

## Adoption Strategy

1. Phase 01~06은 Kernel branch의 source와 disposable fixtures만 변경한다.
2. Phase 02에서 package payload를 만들지만 실제 계정 루트 설치는 하지 않는다.
3. Phase 07에서 임시 HOME과 샘플 프로젝트로 profile parity를 검증한다.
4. Relay와 Kernel의 동시 설치·제거·재설치 순서를 모두 검증한다.
5. operator 승인 후에만 실제 계정 루트 Kernel profile을 설치한다.
6. main 승격은 자동 merge가 아니라 eval 근거가 있는 선택적 이식으로 진행한다.

## Promotion Gates

Hard gates:

- false completion 0
- Relay 상태·프로필·runtime home 오염 0
- 보안·권한 회귀 0
- uninstall이 반대 트랙을 손상시키는 사례 0
- 필수 evidence 누락 0

Quality gates:

- always-loaded prompt/skill metadata Relay 대비 50% 이상 감소 목표
- 대표 작업 성공률 Relay 대비 -5% 이내
- 사용자 개입 횟수 증가 없음
- 중간 산출물 40% 이상 감소 목표
- context receipt 및 completion lineage 추적률 100%

## Closeout Authority

각 Phase 완료는 해당 phase 문서의 fresh verification과 runtime evidence로 판정한다. 전체 Kernel 구현 완료는 Phase 07의 A/B dogfood 결과, package/profile isolation, uninstall rollback, full regression 결과가 모두 통과한 뒤 Kernel completion authority가 결정한다.
