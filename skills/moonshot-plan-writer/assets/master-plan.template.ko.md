# <프로젝트> 마스터 플랜 v<version>

> 이 문서는 모든 계획의 상위 계획입니다.

## 소스 기준선
- `<source-doc-1.md>` (역할: 범위/우선순위)
- `<source-doc-2.md>` (역할: 기술 계약)
- `<source-doc-3.md>` (역할: 경험/상호작용)

## 목표
- <전체 목표>

## Plan Package Readiness
```yaml
planPackageReadiness:
  mode: "prepared_now | prep_phase_required | docs_only | blocked"
  selectedMasterPlan: "docs/implementation/00-master-plan-v<version>.md"
  selectedPhaseDocs:
    - "docs/implementation/01-<slug>-v<version>.md"
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: "none | classify_before_edit | blocked_unknown_owner"
  runtimePointerAction: "none | archive_before_dispatch | blocked_active_workstream"
  archiveRoot: "docs/implementation/archive/<plan-slug>/"
  dryRunCommand: "node .claude/scripts/prepare-implementation-plan-state.mjs --dry-run --plan-dir docs/implementation --master-plan docs/implementation/00-master-plan-v<version>.md --status-file .claude/docs/phase-status.yaml --execution-root docs/implementation/execution/<plan-slug> --archive-label <plan-slug>"
  readinessDecision: "runnable | prep_phase_required | docs_only | blocked"
```

- `mode: prep_phase_required`이면 첫 번째 미완료 체크리스트 항목은 stale root 보존/archive, dirty path 분류, dry-run 준비, pointer self-check를 수행하는 readiness phase여야 합니다.
- `mode: docs_only`이면 이 패키지를 `moonshot-phase-runner`에 바로 물릴 수 있는 것으로 표현하지 않습니다.

## MVP 방법론
```yaml
mvpMethodology:
  profile: "none | demo_first"
  requiredExecutionPack:
    - MVP_SCOPE.md
    - MINI_ARCHITECTURE.md
    - UI_DEMO_PLAN.md
    - UI_FLOW_MAP.md
    - UI_STATE_MATRIX.md
    - MOCK_SCENARIOS.md
    - MOCK_API_CONTRACT.md
    - USER_DEMO_TEST.md
    - DEMO_EVIDENCE.md
    - USER_DEMO_APPROVAL.md
    - POST_DEMO_IMPLEMENTATION_PLAN.md
    - UI_CHANGE_REQUEST.md
```

- MVP가 clickable/mock demo evidence 뒤 사용자 승인까지 hard-stop해야 할 때만 `demo_first`를 사용합니다.
- `demo_first`에서는 모든 in-scope slice가 demo evidence, user approval, Real Functional, Real Functional Verification을 거쳐야 이 plan이 완료될 수 있습니다.

## Phase 인덱스
| Phase | 제목 | 계획 파일 | 선행 의존성 |
|------|------|-----------|-------------|
| 01 | <title> | `docs/implementation/01-<slug>-v<version>.md` | - |

## 실행 순서 메모
- <의존성 및 순서 메모>

## 병렬 실행 계획
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 02 | parallel | disjoint `ownedPaths`; shared mutable write 없음 |
| sequential | 03 | sequential | wave-1 완료 후 실행 |

- Phase-level 병렬 실행은 각 phase에 명시적인 `Phase Execution Metadata`가 있을 때만 허용합니다.
- 순차 phase는 암묵적 순서에 의존하지 말고 blocker 사유를 기록합니다.

## 소스 추적 매트릭스
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| SRC-<n> | AC-<n> | <source-name> | <summary> | <NN> | `docs/implementation/<NN>-<slug>-v<version>.md` | mapped |

## 매핑되지 않은 소스 요구사항
- <없음 또는 누락 사유>

## Phase 완료 체크리스트
- [ ] Phase 01 - <title> (`docs/implementation/01-<slug>-v<version>.md`)
- [ ] Phase 02 - <title> (`docs/implementation/02-<slug>-v<version>.md`)

## 완료 규칙
- 각 phase 계획의 완료 기준이 충족될 때만 체크합니다.
- 명시적 사유 없이 소스 요구사항을 누락하지 않습니다.
- 체크리스트가 모두 완료되기 전에는 전체 완료로 선언하지 않습니다.
