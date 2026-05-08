# Phase 06: Docs and Regression Closeout (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.7 | 사용자 계획 / 문서 갱신 최소화 | trace 문서와 acceptance gate에 truth-source 및 verdict 차이를 반영한다. | 문서 2개만 최소 갱신하고 전체 회귀를 실행한다. |

## 목표
- `.claude/docs/guidelines/meta-harness-trace.md`에 truth-source 우선순위와 reconciler 의미를 추가한다.
- `.claude/docs/guidelines/product-acceptance-gate.md`에 clean complete와 environment-blocked complete 차이를 명시한다.
- 새 테스트와 기존 workflow 관련 테스트를 실행해 계획 closeout 증거를 남긴다.

## 기대 결과
- 문서가 새 runtime contract를 설명하지만 구현 세부사항을 과도하게 확장하지 않는다.
- 전체 회귀가 closeout 가능한 상태다.

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
    - "04"
    - "05"
  conflictsWith: []
  ownedPaths:
    - ".claude/docs/guidelines/meta-harness-trace.md"
    - ".claude/docs/guidelines/product-acceptance-gate.md"
    - "docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-reconciler.test.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/prepare-implementation-plan-state.test.mjs"
    - ".claude/scripts/workflow-enforcement.sh"
  sharedMutablePaths:
    - "docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## 범위
- 포함:
  - trace source priority 문서 갱신
  - fallback reconciler audit 의미 문서화
  - clean complete vs environment-blocked complete 문서화
  - master checklist closeout evidence 기록
- 제외:
  - 별도 운영 가이드 신설
  - 다운스트림 프로젝트 sync
  - README 대규모 수정

## 선행조건과 입력
- Phase 01-05 완료.
- 모든 새 테스트 파일 존재.
- `.claude/docs/phase-status.yaml`가 이 plan package를 가리킨다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P06-1 | meta trace 문서 갱신 | 1) source priority에 status/workflow/session/verdict 관계 추가 2) reconciler supersede 의미 추가 | trace 독자가 raw log 없이 fallback supersede를 해석 가능 |
| P06-2 | product acceptance gate 갱신 | 1) clean complete 조건 명시 2) environment-blocked complete는 clean complete가 아님을 명시 | acceptance gate가 verdict taxonomy와 일치 |
| P06-3 | regression suite 실행 | 1) focused tests 2) prepare plan state test 3) workflow enforcement verify 4) 가능하면 workflow 관련 전체 test scan | required command pass evidence 확보 |
| P06-4 | master checklist 및 closeout evidence 정리 | 1) phase evidence paths 기록 2) checklist 상태 갱신 3) final verifier command 실행 | 전체 plan closeout 가능 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P06-1 | none | `.claude/docs/guidelines/meta-harness-trace.md` | none | `rg -n "superseded-by-local-fallback|completed-via-local-fallback" .claude/docs/guidelines/meta-harness-trace.md` | terms found |
| P06-2 | none | `.claude/docs/guidelines/product-acceptance-gate.md` | none | `rg -n "complete_with_environment_blocker|clean complete" .claude/docs/guidelines/product-acceptance-gate.md` | terms found |
| P06-3 | none | none | `.claude/scripts/*.test.mjs` | `node .claude/scripts/phase-closeout-reconciler.test.mjs` | exit 0 |
| P06-3 | none | none | `.claude/scripts/*.test.mjs` | `node .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |
| P06-3 | none | none | `.claude/scripts/*.test.mjs` | `node .claude/scripts/prepare-implementation-plan-state.test.mjs` | exit 0 |
| P06-3 | none | none | workflow verify | `bash .claude/scripts/workflow-enforcement.sh verify` | exit 0 or documented non-applicable |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-06-1 | 하네스 문서만 봐도 fallback supersede와 truth-source 우선순위를 알 수 있다. | `rg -n "superseded-by-local-fallback|completed-via-local-fallback" .claude/docs/guidelines/meta-harness-trace.md` | both terms found | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/06-docs-regression-closeout/QA_REPORT.md` |
| SCN-06-2 | clean complete와 environment-blocked complete가 acceptance gate에서 분리된다. | `rg -n "complete_with_environment_blocker|clean complete" .claude/docs/guidelines/product-acceptance-gate.md` | both terms found | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/06-docs-regression-closeout/QA_REPORT.md` |
| SCN-06-3 | 전체 closeout regression이 pass하거나 명시적 non-applicable을 남긴다. | `node .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 | `docs/implementation/harness-closeout-consistency-2026-05-08/execution/06-docs-regression-closeout/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: focused tests pass but workflow-enforcement verify가 새 taxonomy를 받아들이지 못하는 경우.
- First review checkpoint: 문서가 구현되지 않은 미래 기능을 완료된 것처럼 말하지 않는지 확인.
- Re-review trigger: Phase 05 verdict vocabulary 변경.
- Verification evidence path: `docs/implementation/harness-closeout-consistency-2026-05-08/execution/06-docs-regression-closeout/QA_REPORT.md`

## 검증 계획
- [ ] `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `node .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node .claude/scripts/prepare-implementation-plan-state.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-closeout-consistency-2026-05-08 --master-plan docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`

## 완료 표시용 증거
- focused test logs
- workflow-enforcement verify output
- final closeout verifier output
- changed file list

## 산출물
- updated trace guideline
- updated product acceptance gate
- final closeout evidence

## Phase 완료 체크리스트
- [ ] 문서 2개가 새 closeout contract를 정확히 반영한다.
- [ ] required regression commands가 실행됐다.
- [ ] master checklist가 증거 기반으로만 갱신됐다.

## 핸드오프 메모
- 이 phase가 끝나면 전체 plan은 implementation-ready가 아니라 implementation-complete closeout 상태여야 한다.
