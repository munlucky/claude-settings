# Harness Closeout Consistency Master Plan v1

> 이 문서는 `phase-status.yaml`, workflow-enforcement 상태 파일, agent-loop 로그, 세션 완료 상태가 서로 다른 결론을 내지 못하게 만드는 v1 개선 작업의 상위 계획입니다.

## 소스 기준선
- 사용자 요청: "하네스 결함 1-6 개선 계획" (역할: 범위/우선순위, 기술 계약)
- `.claude/scripts/phase-run-lease.mjs` (역할: lease 상태 모델)
- `.claude/scripts/moonshot-phase-dispatch.mjs` (역할: delegated-terminal dispatch 및 fallback boundary)
- `.claude/scripts/agent-loop-phase-state.mjs` (역할: phase-status closeout writer 및 completion gate)
- `.claude/scripts/agent-loop-phase-artifacts.mjs` (역할: QA/HANDOFF/SCORECARD 및 WORKSETS writer)
- `.claude/scripts/verify-phase-closeout.mjs` (역할: closeout verifier)
- `.claude/scripts/workflow-enforcement.mjs` (역할: workflow state verifier)
- `.claude/docs/guidelines/meta-harness-trace.md` 및 `.claude/docs/guidelines/product-acceptance-gate.md` (역할: acceptance 문서 계약)

## 목표
- local fallback closeout이 성공했을 때 이전 failed delegated-terminal 상태를 명시적으로 supersede한다.
- 완료 상태에서 live lease 필드가 남지 않게 하고, lease/timestamp/run verdict가 하나의 완료 결론을 가리키게 한다.
- future timestamp, stale active lease, session/workflow contradiction, environment-blocked smoke를 closeout gate에서 hard-fail 또는 별도 normalized verdict로 분리한다.
- runner 전체 재작성 없이 reconciler, writer, verifier, verdict normalizer, 최소 문서 갱신으로 닫는다.

## Scope
- 포함:
  - `.claude/scripts/phase-closeout-reconciler.mjs` 신규 추가
  - closeout/lease/timestamp writer 보강
  - closeout verifier 및 workflow evidence drift gate 강화
  - environment-blocked smoke verdict 분리
  - synthetic fixture 기반 회귀 테스트 추가
  - truth-source 우선순위와 acceptance gate 문서 최소 갱신
- 제외:
  - `.claude/runtime-state.sqlite` schema 전체 재설계
  - delegated-terminal runner 전체 재작성
  - 과거 실제 세션 jsonl에 의존하는 비결정적 테스트
  - product feature 구현 또는 downstream 프로젝트 동기화

## Phase 인덱스
| Phase | 제목 | 계획 파일 | 선행 의존성 |
|------|------|-----------|-------------|
| 01 | Regression Fixtures and Clock Contract | `docs/implementation/harness-closeout-consistency-2026-05-08/01-regression-fixtures-clock-contract-v1.md` | - |
| 02 | Fallback Closeout Reconciler | `docs/implementation/harness-closeout-consistency-2026-05-08/02-fallback-closeout-reconciler-v1.md` | 01 |
| 03 | Lease and Timestamp Writer Contract | `docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md` | 01, 02 |
| 04 | Closeout Drift Verifier Gate | `docs/implementation/harness-closeout-consistency-2026-05-08/04-closeout-drift-verifier-gate-v1.md` | 01, 02, 03 |
| 05 | Environment-Blocked Verdict Normalizer | `docs/implementation/harness-closeout-consistency-2026-05-08/05-environment-blocked-verdict-normalizer-v1.md` | 01, 04 |
| 06 | Docs and Regression Closeout | `docs/implementation/harness-closeout-consistency-2026-05-08/06-docs-regression-closeout-v1.md` | 01-05 |

## 실행 순서 메모
- Phase 01은 실패 fixture와 deterministic clock contract를 먼저 고정한다. 이후 phase는 해당 fixture를 pass로 전환한다.
- Phase 02와 03은 둘 다 status/workflow state를 만지지만 책임이 다르다. 02는 fallback supersede, 03은 live lease/timestamp writer contract다.
- Phase 04는 이전 phase의 결과를 verifier hard-fail 규칙으로 고정한다.
- Phase 05는 clean complete와 environment-blocked complete를 분리한다.
- Phase 06은 문서와 전체 회귀 closeout만 다룬다.

## 병렬 실행 계획
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | fixture가 이후 구현의 기준선이다. |
| wave-2 | 02 | sequential | `current-run.json`, `active-phase-run.json`, `latest-dispatch.json` semantics를 확정한다. |
| wave-3 | 03 | sequential | 02의 supersede 필드와 같은 status root를 수정한다. |
| wave-4 | 04 | sequential | 02/03 writer semantics를 verifier로 hard-fail 고정한다. |
| wave-5 | 05 | sequential | closeout verdict priority와 workflow gate에 영향을 준다. |
| wave-6 | 06 | sequential | 최종 문서와 전체 회귀 closeout. |

- 병렬 실행은 v1에서 의도적으로 차단한다. 핵심 파일이 shared mutable 상태 writer/verifier이므로 같은 phase-status root와 workflow log schema를 동시에 바꾸면 검증 결론이 흔들린다.

## 소스 추적 매트릭스
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | 사용자 계획 / Implementation Order 1 | 1-6 결함을 synthetic fixture로 고정한다. | 01 | `docs/implementation/harness-closeout-consistency-2026-05-08/01-regression-fixtures-clock-contract-v1.md` | mapped |
| REQ-1.2 | 사용자 계획 / Key Changes | fallback closeout reconciler를 추가하고 failed delegated run을 supersede한다. | 02 | `docs/implementation/harness-closeout-consistency-2026-05-08/02-fallback-closeout-reconciler-v1.md` | mapped |
| REQ-1.3 | 사용자 계획 / Lease 상태 모델 정리 | 완료 상태에서 live lease 필드를 제거하고 last/superseded 필드로 이동한다. | 03 | `docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md` | mapped |
| REQ-1.4 | 사용자 계획 / Timestamp guard 추가 | `nowIso()` provider와 future timestamp guard를 도입한다. | 03 | `docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md` | mapped |
| REQ-1.5 | 사용자 계획 / Source-of-truth drift gate 강화 | phase-status/workflow/session contradiction과 stale lease를 hard-fail한다. | 04 | `docs/implementation/harness-closeout-consistency-2026-05-08/04-closeout-drift-verifier-gate-v1.md` | mapped |
| REQ-1.6 | 사용자 계획 / environment-blocked smoke 판정 분리 | environment-blocked smoke를 clean complete가 아닌 `complete_with_environment_blocker`로 기록한다. | 05 | `docs/implementation/harness-closeout-consistency-2026-05-08/05-environment-blocked-verdict-normalizer-v1.md` | mapped |
| REQ-1.7 | 사용자 계획 / 문서 갱신 최소화 | trace/acceptance 문서에 truth-source와 verdict 차이를 최소 반영한다. | 06 | `docs/implementation/harness-closeout-consistency-2026-05-08/06-docs-regression-closeout-v1.md` | mapped |

## 매핑되지 않은 소스 요구사항
- 없음.

## Phase 완료 체크리스트
- [x] Phase 01 - Regression Fixtures and Clock Contract (`docs/implementation/harness-closeout-consistency-2026-05-08/01-regression-fixtures-clock-contract-v1.md`) - phase-status completed, checkpoint `caef31b`
- [x] Phase 02 - Fallback Closeout Reconciler (`docs/implementation/harness-closeout-consistency-2026-05-08/02-fallback-closeout-reconciler-v1.md`) - phase-status completed, checkpoint `92a5bad`
- [x] Phase 03 - Lease and Timestamp Writer Contract (`docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md`) - phase-status completed, checkpoint `886084b`
- [x] Phase 04 - Closeout Drift Verifier Gate (`docs/implementation/harness-closeout-consistency-2026-05-08/04-closeout-drift-verifier-gate-v1.md`) - phase-status completed, checkpoint `003c6dc`
- [x] Phase 05 - Environment-Blocked Verdict Normalizer (`docs/implementation/harness-closeout-consistency-2026-05-08/05-environment-blocked-verdict-normalizer-v1.md`) - phase-status completed, checkpoint `ad926e2`
- [x] Phase 06 - Docs and Regression Closeout (`docs/implementation/harness-closeout-consistency-2026-05-08/06-docs-regression-closeout-v1.md`) - phase-status completed, host closeout evidence `.claude/verification-verdict-phase06-final.json`

## Closeout 규칙
- 각 phase 계획의 완료 기준이 충족될 때만 체크한다.
- `phase-status.yaml`, workflow state, dispatch state, QA/HANDOFF/SCORECARD, verifier verdict가 서로 충돌하면 완료로 선언하지 않는다.
- `complete_with_environment_blocker`는 local implementation closeout은 허용할 수 있지만 clean complete는 아니다.
- 모든 required smoke가 통과해야만 `clean_finish`, `success`, `scope_complete`, scorecard `done/FULL` 조합을 허용한다.
