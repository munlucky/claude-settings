# Phase 01: Regression Fixtures and Clock Contract (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | 사용자 계획 / Implementation Order 1 | 1-6 결함을 synthetic fixture로 고정한다. | failing fixture와 deterministic clock injection contract를 먼저 추가한다. |

## 목표
- 관측된 6개 결함을 실제 과거 세션 파일 없이 synthetic fixture로 재현한다.
- timestamp 검증은 wall clock에 묶지 않고 injected clock으로 deterministic하게 만든다.

## 기대 결과
- 기존 구현에서는 새 fixture 중 drift/future/environment-blocked 케이스가 실패한다.
- 이후 phase가 구현되면 같은 fixture가 pass 기준선이 된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-consistency-sequential"
  dependsOn: []
  conflictsWith:
    - "02"
    - "03"
    - "04"
    - "05"
  ownedPaths:
    - ".claude/scripts/phase-closeout-reconciler.test.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/lib/clock.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  sharedMutablePaths:
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - delegated-terminal failed + local fallback complete fixture
  - failed `current-run.json` + completed `phase-status.yaml` fixture
  - completed status에 stale `activeRunLeaseId`가 남는 fixture
  - future timestamp fixture
  - session `task_complete` + workflow failed fixture
  - environment-blocked smoke + plan complete fixture
- 제외:
  - reconciler 실제 구현
  - verifier hard-fail 구현
  - runtime-state SQLite schema 변경

## 선행조건과 입력
- 필수 문서:
  - `docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`
- 필수 코드/데이터:
  - Node.js 실행 가능
  - `.claude/scripts/verify-phase-closeout.test.mjs`
  - `.claude/scripts/prepare-implementation-plan-state.test.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P01-1 | fixture factory 작성 | 1) temp root 생성 helper 작성 2) phase-status/workflow/session jsonl writer 작성 3) fixed clock 값 주입 | 6개 결함 fixture를 중복 없이 생성 가능 |
| P01-2 | reconciler regression test 추가 | 1) 새 `phase-closeout-reconciler.test.mjs` 생성 2) reconciler 전 drift 상태 assert 3) 이후 phase 구현을 위한 expected shape 명시 | 현재 구현에서 missing script 또는 drift로 실패하는 test가 존재 |
| P01-3 | closeout verifier regression test 추가 | 1) `verify-phase-closeout.test.mjs`에 contradiction/stale/future/environment cases 추가 2) expected violation code 정의 | 각 defect가 명확한 violation code를 기대 |
| P01-4 | clock contract test 추가 | 1) `nowIso()` provider 또는 equivalent helper를 위한 test shell 작성 2) future timestamp `now + 5초` 초과 케이스 고정 | clock injection 없이는 pass 불가한 deterministic test 확보 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P01-1 | none | `.claude/scripts/verify-phase-closeout.test.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | phase 구현 전에는 신규 hard-fail 기대치 때문에 fail 가능 |
| P01-2 | `.claude/scripts/phase-closeout-reconciler.test.mjs` | none | `.claude/scripts/phase-closeout-reconciler.test.mjs` | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | script missing 또는 assertion fail로 red |
| P01-3 | `.claude/scripts/lib/clock.test.mjs` | none | `.claude/scripts/lib/clock.test.mjs` | `node .claude/scripts/lib/clock.test.mjs` | clock helper 구현 전 red |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | 하네스 결함 6종이 synthetic regression으로 재현된다. | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | red 또는 explicit missing implementation signal | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/01-regression-fixtures-clock-contract/QA_REPORT.md` |
| SCN-01-2 | future timestamp 판정이 deterministic clock으로 검증된다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | fixture가 expected violation code를 낸다. | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/01-regression-fixtures-clock-contract/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: fixture가 실제 repo 필드명과 맞지 않아 이후 구현자가 어떤 필드를 수정해야 하는지 알 수 없는 경우.
- First review checkpoint: fixture expected JSON/YAML shape가 사용자 계획의 `fallbackRunId`, `supersededRunLeaseId`, `supersededAt`, `completionBoundary`, `normalizedRunVerdict`를 모두 포함하는지 확인.
- Re-review trigger: Phase 02-05에서 schema명을 바꿔야 하는 경우 Phase 01 fixture도 함께 갱신.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/01-regression-fixtures-clock-contract/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node .claude/scripts/prepare-implementation-plan-state.test.mjs`

## 완료 표시용 증거
- 새 fixture test output
- changed file list
- red/green 전환 사유

## 산출물
- `.claude/scripts/phase-closeout-reconciler.test.mjs`
- `.claude/scripts/verify-phase-closeout.test.mjs` fixture cases
- optional `.claude/scripts/lib/clock.test.mjs`

## Phase 완료 체크리스트
- [ ] 6개 결함 fixture가 각각 독립 assertion을 가진다.
- [ ] future timestamp fixture가 injected clock 기준으로 판정된다.
- [ ] expected violation code가 후속 phase 구현과 충돌하지 않는다.

## 핸드오프 메모
- 이 phase는 red baseline을 만드는 단계다. 후속 phase가 green으로 바꾸는 것이 정상이다.
