# Phase 03: Lease and Timestamp Writer Contract (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.3 | 사용자 계획 / Lease 상태 모델 정리 | 완료 상태에서는 live lease field를 남기지 않는다. | phase status lease writer와 runtime mirror를 수정한다. |
| REQ-1.4 | 사용자 계획 / Timestamp guard 추가 | 단일 `nowIso()` provider와 future timestamp guard를 도입한다. | clock helper와 writer/verifier timestamp contract를 추가한다. |

## 목표
- 완료 상태에서 `activeRunLeaseId`와 `activeExecutionHeartbeatAt`을 live field로 남기지 않는다.
- 기존 lease는 `lastRunLeaseId` 또는 `supersededRunLeaseId`로 이동하고 heartbeat는 `lastExecutionHeartbeatAt`로 보존한다.
- closeout writer가 단일 `nowIso()` provider 또는 injected clock을 사용하게 한다.

## 기대 결과
- completed status에 active lease가 있으면 verifier가 fail한다.
- writer가 만든 `completedAt`, `lastUpdatedAt`, `goalRuntime.updatedAt`, workflow state `updatedAt`은 `now + 5초`를 초과하지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-consistency-sequential"
  dependsOn:
    - "01"
    - "02"
  conflictsWith:
    - "04"
    - "05"
  ownedPaths:
    - ".claude/scripts/lib/clock.mjs"
    - ".claude/scripts/lib/clock.test.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/runtime-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
  readOnlyPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/phase-closeout-reconciler.mjs"
  sharedMutablePaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - reusable `nowIso()` provider
  - test-only injected clock support
  - completed/superseded lease field migration
  - future timestamp guard plumbing
- 제외:
  - 기존 timestamp format 전면 변경
  - historical artifact rewrite
  - SQLite runtime-state redesign

## 선행조건과 입력
- Phase 02 reconciler field names:
  - `fallbackRunId`
  - `supersededRunLeaseId`
  - `supersededAt`
  - `completionBoundary`
- Current writer targets:
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P03-1 | clock helper 추가 | 1) `nowIso(clock?)` 구현 2) ms 제거 여부 기존 format과 맞춤 3) test injection 지원 | deterministic clock test pass |
| P03-2 | phase-run lease finish semantics 수정 | 1) active fields formatter 확장 2) finish 시 active fields 제거/비움 3) last/superseded fields 기록 | completed phase-status root에 live active lease가 없다. |
| P03-3 | runtime mirror timestamp 정합화 | 1) runtime-state mirror writer timestamp helper 적용 2) `goalRuntime.updatedAt` guard 3) workflow state `updatedAt` helper 적용 | future timestamp fixture fail/pass 기준 충족 |
| P03-4 | artifact writer timestamp 정합화 | 1) `new Date().toISOString()` 직접 호출 제거 또는 helper 집중 2) completedAt/lastUpdatedAt 동일 now 사용 | same closeout write에서 timestamp divergence 없음 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P03-1 | `.claude/scripts/lib/clock.mjs` | none | `.claude/scripts/lib/clock.test.mjs` | `node .claude/scripts/lib/clock.test.mjs` | injected clock timestamp pass |
| P03-2 | none | `.claude/scripts/phase-run-lease.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | completed stale active lease fixture fail before, pass after valid writer |
| P03-4 | none | `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/runtime-state.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | future timestamp violation only fires for injected future fixture |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | 완료된 plan/phase 상태판에 active lease가 살아있는 것처럼 보이지 않는다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | stale active lease fixture hard-fail, valid completed fixture pass | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/03-lease-timestamp-writer-contract/QA_REPORT.md` |
| SCN-03-2 | closeout timestamp가 현재보다 미래로 튀면 완료 주장이 막힌다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | future timestamp fixture violation code pass | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/03-lease-timestamp-writer-contract/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: active field 제거가 기존 active run heartbeat 판정까지 깨뜨리는 경우.
- First review checkpoint: active run과 completed run의 field set이 명확히 분리됐는지 확인.
- Re-review trigger: verifier가 active in-progress state까지 stale로 오탐하는 경우.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/03-lease-timestamp-writer-contract/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/lib/clock.test.mjs`
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `node .claude/scripts/prepare-implementation-plan-state.test.mjs`

## 완료 표시용 증거
- clock helper test pass
- stale lease fixture pass/fail evidence
- future timestamp fixture evidence

## 산출물
- clock helper
- lease writer updates
- timestamp writer contract updates

## Phase 완료 체크리스트
- [ ] 완료 상태에 live lease field가 남지 않는다.
- [ ] `lastRunLeaseId` 또는 `supersededRunLeaseId`가 audit trail을 보존한다.
- [ ] timestamp guard가 deterministic하게 검증된다.

## 핸드오프 메모
- Phase 04에서 이 writer contract를 verifier hard-fail로 최종 고정한다.
