# Phase 05: Environment-Blocked Verdict Normalizer (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.6 | 사용자 계획 / environment-blocked smoke 판정 분리 | 외부 provider smoke가 환경 문제로 막힌 경우 clean complete로 기록하지 않는다. | normalized verdict와 environmentBlockers field를 추가한다. |

## 목표
- external provider smoke가 환경 문제로 막힌 경우 `clean_finish` 또는 clean complete로 기록하지 않는다.
- `normalizedRunVerdict: complete_with_environment_blocker`와 `environmentBlockers`를 기록한다.
- scorecard/QA/verdict 문구가 같은 normalized verdict를 사용한다.

## 기대 결과
- 모든 required smoke가 통과해야만 clean complete가 허용된다.
- 환경 문제로 막힌 external smoke는 local implementation completion과 구분된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout-consistency-sequential"
  dependsOn:
    - "01"
    - "04"
  conflictsWith:
    - "06"
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/render-scorecard.py"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/docs/guidelines/product-acceptance-gate.md"
  sharedMutablePaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - `complete_with_environment_blocker` normalized verdict
  - `environmentBlockers: [{ check, reason, evidencePath, observedAt }]`
  - QA/HANDOFF/SCORECARD wording alignment
  - clean complete blocker in verifier/workflow gate
- 제외:
  - provider-specific smoke implementation
  - credentials provisioning
  - external account workflow automation

## 선행조건과 입력
- Phase 04 hard-fail gate exists.
- Existing failure classification can distinguish environment-blocked cases.
- Current `normalizedRunVerdict` writer exists in `moonshot-phase-dispatch.mjs` and `agent-loop-phase-state.mjs`.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P05-1 | normalized verdict vocabulary 확장 | 1) priority table에 `complete_with_environment_blocker` 추가 2) clean success보다 낮고 failed보다 분리된 priority 지정 3) status writer support | status root에 새 verdict가 기록된다. |
| P05-2 | environmentBlockers field 기록 | 1) smoke blocker source 추출 2) check/reason/evidencePath/observedAt 기록 3) timestamp helper 사용 | QA/status/verdict에서 같은 blocker가 확인된다. |
| P05-3 | clean complete gate 수정 | 1) required smoke 미통과 시 clean_finish 차단 2) environment blocker는 별도 pass path로만 인정 3) scorecard FULL/done 오용 방지 | environment-blocked fixture가 clean complete로 pass하지 않는다. |
| P05-4 | scorecard/QA/verdict 문구 정합화 | 1) QA Runtime Updates 추가 2) SCORECARD verdict text 조정 3) verification verdict field 반영 | 사용자에게 clean complete와 environment-blocked가 명확히 구분된다. |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P05-1 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | `complete_with_environment_blocker` recognized |
| P05-3 | none | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/workflow-enforcement.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | environment-blocked smoke cannot claim clean complete |
| P05-4 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/render-scorecard.py` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | QA/SCORECARD/verdict wording aligned |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | external provider smoke가 환경 문제로 막히면 clean complete가 아니라 environment-blocked complete로 보인다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | `normalizedRunVerdict: complete_with_environment_blocker` fixture pass | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/05-environment-blocked-verdict-normalizer/QA_REPORT.md` |
| SCN-05-2 | required smoke가 모두 통과하지 않았는데 scorecard가 FULL/done으로 닫히지 않는다. | `bash .claude/scripts/workflow-enforcement.sh verify` | clean_finish violation or environment-blocker verdict | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/05-environment-blocked-verdict-normalizer/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: environment-blocked와 implementation failure가 같은 failure class로 합쳐져 retry/stop 판단을 흐리는 경우.
- First review checkpoint: required smoke definition이 phase plan 또는 verification contract에서 추적 가능한지 확인.
- Re-review trigger: scorecard FULL semantics를 바꾸게 되면 product acceptance gate 문서도 함께 갱신.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/05-environment-blocked-verdict-normalizer/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`

## 완료 표시용 증거
- environment-blocked fixture output
- QA/SCORECARD sample artifact diff
- workflow-enforcement verify output

## 산출물
- normalized verdict updates
- environmentBlockers field support
- clean complete gate update

## Phase 완료 체크리스트
- [ ] `complete_with_environment_blocker`가 clean complete와 분리된다.
- [ ] `environmentBlockers`가 check/reason/evidencePath/observedAt을 가진다.
- [ ] required smoke 미통과 상태는 `clean_finish`로 닫히지 않는다.

## 핸드오프 메모
- Phase 06에서 문서와 전체 회귀 command를 최신 verdict vocabulary로 맞춘다.
