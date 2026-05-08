# Phase 04: Closeout Drift Verifier Gate (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.5 | 사용자 계획 / Source-of-truth drift gate 강화 | status/workflow/session contradiction과 stale lease를 hard-fail한다. | `verify-phase-closeout.mjs`와 workflow verification assertions를 강화한다. |

## 목표
- `phase-status`는 completed인데 `current-run.completionStatus == failed`이고 supersede 정보가 없으면 fail한다.
- 세션 jsonl에 `task_complete`가 있는데 workflow-enforcement가 failed로 남아 있으면 fail한다.
- stale lease가 active field에 남아 있으면 fail한다.
- superseded fallback 상태는 정상 완료로 인정한다.

## 기대 결과
- 완료 주장에 필요한 source-of-truth가 하나의 결론으로 수렴한다.
- fallback supersede가 없는 contradiction은 hard-fail한다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-consistency-sequential"
  dependsOn:
    - "01"
    - "02"
    - "03"
  conflictsWith:
    - "05"
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-reconciler.mjs"
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
  sharedMutablePaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - workflow log JSON reader for `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`
  - session jsonl fixture parser limited to `task_complete`
  - stale active lease root field detection
  - future timestamp violation
  - superseded fallback allowlist
- 제외:
  - arbitrary jsonl session crawling
  - unrelated verifier taxonomy refactor
  - non-closeout workflow policy changes

## 선행조건과 입력
- Phase 02 supersede fields are implemented.
- Phase 03 completed lease semantics are implemented.
- Test fixtures from Phase 01 exist.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P04-1 | workflow contradiction reader 추가 | 1) workflowDir option 또는 inferred path 처리 2) current/latest/active JSON 읽기 3) failed unsuperseded 판정 | completed phase + failed current-run fixture가 hard-fail |
| P04-2 | session contradiction reader 추가 | 1) test fixture jsonl path support 2) `task_complete` event detection 3) workflow failed와 충돌 시 violation | session complete + workflow failed fixture hard-fail |
| P04-3 | stale lease/future timestamp guard 추가 | 1) active root field parse 2) completed status와 active field 충돌 판정 3) timestamp > now + 5s 판정 | stale/future fixtures hard-fail |
| P04-4 | fallback supersede allow rule 추가 | 1) `superseded-by-local-fallback` allow 2) `completed-via-local-fallback` allow 3) missing supersede fail 유지 | reconciler 후 fixture pass |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P04-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | unsuperseded failed current-run violation |
| P04-2 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | session/workflow contradiction violation |
| P04-4 | none | `.claude/scripts/workflow-enforcement.mjs` | `.claude/scripts/phase-closeout-reconciler.test.mjs` | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | reconciler after-state accepted |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | 상태판이 completed여도 workflow state가 failed로 남아 있으면 완료로 닫히지 않는다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | `workflow-state-contradiction` 또는 equivalent violation pass | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/04-closeout-drift-verifier-gate/QA_REPORT.md` |
| SCN-04-2 | local fallback supersede가 있으면 이전 failed delegated run은 최종 실패로 취급하지 않는다. | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | superseded fixture closeout verifier pass | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/04-closeout-drift-verifier-gate/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: verifier가 current repo의 normal prepared state를 failed contradiction으로 오탐하는 경우.
- First review checkpoint: violation codes가 QA/HANDOFF에서 원인 추적 가능한 수준으로 구체적인지 확인.
- Re-review trigger: workflow-enforcement current-run schema가 바뀌면 reader fixture도 갱신.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/04-closeout-drift-verifier-gate/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`

## 완료 표시용 증거
- closeout verifier test pass
- workflow-enforcement verify output
- fixture violation code list

## 산출물
- drift gate 강화된 `.claude/scripts/verify-phase-closeout.mjs`
- workflow contradiction validation update

## Phase 완료 체크리스트
- [ ] unsuperseded failed workflow state는 hard-fail한다.
- [ ] session complete + workflow failed contradiction은 hard-fail한다.
- [ ] superseded fallback은 정상 완료로 인정한다.

## 핸드오프 메모
- Phase 05는 environment-blocked verdict를 이 verifier gate와 같은 normalized vocabulary로 맞춘다.
