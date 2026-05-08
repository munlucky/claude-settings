# Phase 02: Fallback Closeout Reconciler (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.2 | 사용자 계획 / Fallback closeout reconciler 추가 | local fallback 완료 시 failed delegated-terminal run을 supersede한다. | 새 reconciler 스크립트와 dispatch/fallback 호출 지점을 추가한다. |

## 목표
- `.claude/scripts/phase-closeout-reconciler.mjs`를 추가한다.
- fallback closeout 직후 `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`의 failed delegated-terminal state를 `superseded-by-local-fallback`로 닫는다.
- fallback 완료 state를 `completed-via-local-fallback`로 기록한다.

## 기대 결과
- fallback 완료 이후 `phase-status.yaml`과 workflow-enforcement state가 서로 다른 결론을 내지 않는다.
- 없는 상태 파일은 warning으로만 기록하고, 존재하는 drift는 반드시 닫는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-consistency-sequential"
  dependsOn:
    - "01"
  conflictsWith:
    - "03"
    - "04"
    - "05"
  ownedPaths:
    - ".claude/scripts/phase-closeout-reconciler.mjs"
    - ".claude/scripts/phase-closeout-reconciler.test.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/logs/workflow-enforcement"
  sharedMutablePaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - CLI args: `--status-file`, `--workflow-dir`, `--fallback-run-id`, `--reason`, `--now`
  - JSON atomic write helper
  - `current-run.json`, `active-phase-run.json`, `latest-dispatch.json` reconciliation
  - agent-loop debug/log fallback closeout summary event
- 제외:
  - generic YAML parser 도입
  - runtime-state SQLite migration
  - 모든 과거 dispatch 파일 일괄 rewrite

## 선행조건과 입력
- Phase 01 fixture가 존재해야 한다.
- workflow log default dir: `.claude/logs/workflow-enforcement`
- status file default: `.claude/docs/phase-status.yaml`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P02-1 | reconciler CLI 구현 | 1) args parse 2) JSON read/write 3) missing file warnings 4) summary JSON 출력 | CLI가 temp fixture에서 deterministic output을 낸다. |
| P02-2 | workflow state supersede | 1) failed delegated run 판정 2) `status: superseded-by-local-fallback` 기록 3) `fallbackRunId`, `supersededRunLeaseId`, `supersededAt`, `completionBoundary` 기록 | 세 workflow 파일이 같은 fallback 결론을 가진다. |
| P02-3 | fallback 완료 mirror 기록 | 1) fallback run payload 생성 2) `completionStatus: completed-via-local-fallback` 기록 3) `reason` 보존 | verifier가 superseded fallback을 정상 완료로 인정할 수 있는 shape 확보 |
| P02-4 | dispatch 호출 지점 연결 | 1) local fallback이 phase/plan complete 기록하는 경로 식별 2) closeout 직후 reconciler 호출 3) debug log event 추가 | local fallback path에서 summary event가 남는다. |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P02-1 | `.claude/scripts/phase-closeout-reconciler.mjs` | none | `.claude/scripts/phase-closeout-reconciler.test.mjs` | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | failed delegated state가 superseded fallback state로 변경 |
| P02-4 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/phase-closeout-reconciler.test.mjs` | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | debug summary event 검증 pass |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | local fallback 완료 후 failed delegated-terminal 상태가 더 이상 최종 실패처럼 보이지 않는다. | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | `current-run`, `active-phase-run`, `latest-dispatch`가 `superseded-by-local-fallback` 또는 `completed-via-local-fallback`를 기록 | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/02-fallback-closeout-reconciler/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: local fallback closeout 호출 지점이 하나로 특정되지 않아 중복 reconciler 호출이 필요한 경우.
- First review checkpoint: reconciler가 없는 파일을 생성하지 않고 warning만 남기는지 확인.
- Re-review trigger: Phase 03에서 lease field names가 바뀌면 reconciler payload도 함께 갱신.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/02-fallback-closeout-reconciler/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`

## 완료 표시용 증거
- reconciler test pass log
- temp fixture before/after state diff
- debug log summary event assertion

## 산출물
- `.claude/scripts/phase-closeout-reconciler.mjs`
- fallback closeout 호출 지점 patch

## Phase 완료 체크리스트
- [ ] failed delegated-terminal state가 superseded로 닫힌다.
- [ ] fallback 완료 state가 `completed-via-local-fallback`로 남는다.
- [ ] summary event가 agent-loop debug/log에 남는다.

## 핸드오프 메모
- 이 phase는 fallback path의 contradiction만 닫는다. completed state의 stale live lease 제거는 Phase 03 책임이다.
