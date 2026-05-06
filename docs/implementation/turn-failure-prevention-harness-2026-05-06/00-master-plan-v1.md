# Turn Failure Prevention Harness Master Plan v1

> 이 문서는 에이전트 턴 단위 실패 재발 방지 하네스 작업의 plan of all plans다.

## Source Baseline
- `C:\Users\moon\Downloads\턴 단위 실패 재발 방지 하네스 계획.md` (role: scope/priority + technical contract)
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md` (role: current AWTL implementation baseline)
- `.claude/schemas/awtl-event-v1.schema.json` (role: event envelope contract)
- `.claude/schemas/awtl-memory-candidate-v1.schema.json` (role: memory candidate contract)
- `.claude/scripts/lib/awtl-harness-capture.mjs`, `.claude/scripts/lib/awtl-trace-sink.mjs`, `.claude/scripts/lib/awtl-memory-promotion.mjs` (role: current implementation entrypoints)
- `README.md`, `AGENTS.md` (role: repository operating constraints)

## Source Gaps And Decisions
- `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`는 없다. 첨부 계획과 현재 AWTL 구현 문서를 PRD/SPEC 대체 기준선으로 사용한다.
- 기존 AWTL phase 01-06은 완료 상태지만, runner capture가 실제 `turn_id`를 전파하지 않고 promotion output은 `write_status: not_implemented`를 남긴다. 이번 계획은 기존 시스템을 교체하지 않고 보강한다.
- 즉시 재발 방지는 장기 MemoryGraph write가 아니라 ignored cache 기반 `Failure Prevention Brief`가 담당한다.

## Objective
- AWTL 기반 관측을 턴 단위로 연결해 `failed turn -> failed_turn_case -> next-run prevention brief -> replay/approval based MemoryGraph promotion` 루프를 닫는다.
- raw trace, prompt body, full stdout/stderr, transcript-only/imported-only 후보가 장기 메모리에 들어가지 않도록 fail-closed 정책을 유지한다.
- 기존 phase-runner와 AWTL entrypoint를 유지하고, 최소한의 shared harness surface만 변경한다.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Trace Hygiene And Trace Root Guard | `docs/implementation/turn-failure-prevention-harness-2026-05-06/01-trace-hygiene-trace-root-guard-v1.md` | - |
| 02 | Turn Identity Capture | `docs/implementation/turn-failure-prevention-harness-2026-05-06/02-turn-identity-capture-v1.md` | 01 |
| 03 | Failed Turn Case Builder | `docs/implementation/turn-failure-prevention-harness-2026-05-06/03-failed-turn-case-builder-v1.md` | 02 |
| 04 | Next Run Recall Brief | `docs/implementation/turn-failure-prevention-harness-2026-05-06/04-next-run-recall-brief-v1.md` | 03 |
| 05 | Verified Memory Promotion And Replay Scorecard | `docs/implementation/turn-failure-prevention-harness-2026-05-06/05-verified-memory-promotion-replay-scorecard-v1.md` | 03 |
| 06 | Regression Contract And Docs Sync | `docs/implementation/turn-failure-prevention-harness-2026-05-06/06-regression-contract-docs-sync-v1.md` | 01-05 |

## Execution Order Notes
- Phase 01은 tracked trace artifact 유출과 nested trace root를 먼저 막는다. 이후 phase가 trace를 더 쓰기 전에 반드시 끝나야 한다.
- Phase 02는 runner capture의 `turn_id` 전파를 만든다. Phase 03-05는 `failure_turn_id`가 있어야 정확해진다.
- Phase 04와 Phase 05는 모두 Phase 03 산출물을 읽지만 shared runner/promotion 경계를 각각 수정하므로 별도 순차 검증으로 닫는다.
- Phase 06은 모든 phase 뒤에서 contract, docs, parity fixture, closeout evidence를 정리한다.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | trace artifact cleanup과 policy gate가 선행되어야 함 |
| wave-2 | 02 | sequential | runner capture와 trace schema 경계 수정 |
| wave-3 | 03 | sequential | Phase 02의 `turn_id` 전파가 입력 |
| wave-4 | 04 | sequential | phase runner prompt build 경로 수정 |
| wave-5 | 05 | sequential | promotion gate와 direct MemoryGraph write 경로 수정 |
| closeout | 06 | sequential | 전체 regression, docs, contract sync |

- 이번 작업은 `.claude/scripts/agent-loop-phase-runner.mjs`, AWTL libs, schemas, verification policy가 shared mutable surface라 phase-level 병렬 실행을 기본 허용하지 않는다.

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| TFP-001 | Downloaded plan Summary | 실패 턴을 즉시 ephemeral prevention hint로 남김 | 03, 04 | `03-failed-turn-case-builder-v1.md`, `04-next-run-recall-brief-v1.md` | mapped |
| TFP-002 | Downloaded plan P0 Safety | trace artifact 유출과 nested trace root를 hard fail | 01 | `01-trace-hygiene-trace-root-guard-v1.md` | mapped |
| TFP-003 | Downloaded plan Turn Identity | 기존 `turn_id` 필드를 실제 runner capture에 사용 | 02 | `02-turn-identity-capture-v1.md` | mapped |
| TFP-004 | Downloaded plan Failed Turn Case | failed judge result마다 compact failed turn case 생성 | 03 | `03-failed-turn-case-builder-v1.md` | mapped |
| TFP-005 | Downloaded plan Next-Run Recall | 다음 작업 시작 전 matching case를 brief로 주입 | 04 | `04-next-run-recall-brief-v1.md` | mapped |
| TFP-006 | Downloaded plan Memory Promotion | replay/approval 통과 후보만 MemoryGraph에 compact fact write | 05 | `05-verified-memory-promotion-replay-scorecard-v1.md` | mapped |
| TFP-007 | Downloaded plan Replay Scorecard | replay/promotion 결과를 scorecard로 누적하고 recall 필터에 반영 | 05 | `05-verified-memory-promotion-replay-scorecard-v1.md` | mapped |
| TFP-008 | Current AWTL baseline | raw trace는 MemoryGraph에 직접 저장하지 않음 | 03, 05 | `03-failed-turn-case-builder-v1.md`, `05-verified-memory-promotion-replay-scorecard-v1.md` | mapped |
| TFP-009 | Repo constraints | MemoryGraph transport failure는 Git/workflow closeout을 막지 않음 | 05, 06 | `05-verified-memory-promotion-replay-scorecard-v1.md`, `06-regression-contract-docs-sync-v1.md` | mapped |
| TFP-010 | Test Plan | trace, capture, case, recall, promotion, regression 검증 | 01-06 | all phase files | mapped |

## Unmapped Source Requirements
- 없음.

## Phase Completion Checklist
- [x] Phase 01 - Trace Hygiene And Trace Root Guard (`docs/implementation/turn-failure-prevention-harness-2026-05-06/01-trace-hygiene-trace-root-guard-v1.md`)
- [x] Phase 02 - Turn Identity Capture (`docs/implementation/turn-failure-prevention-harness-2026-05-06/02-turn-identity-capture-v1.md`)
- [x] Phase 03 - Failed Turn Case Builder (`docs/implementation/turn-failure-prevention-harness-2026-05-06/03-failed-turn-case-builder-v1.md`)
- [x] Phase 04 - Next Run Recall Brief (`docs/implementation/turn-failure-prevention-harness-2026-05-06/04-next-run-recall-brief-v1.md`)
- [x] Phase 05 - Verified Memory Promotion And Replay Scorecard (`docs/implementation/turn-failure-prevention-harness-2026-05-06/05-verified-memory-promotion-replay-scorecard-v1.md`)
- [x] Phase 06 - Regression Contract And Docs Sync (`docs/implementation/turn-failure-prevention-harness-2026-05-06/06-regression-contract-docs-sync-v1.md`)

## Completion Rule
- 체크박스는 해당 phase plan의 completion criteria와 fresh verification evidence가 충족될 때만 `[x]`로 바꾼다.
- source-only evidence로 완료 선언하지 않는다.
- MemoryGraph unavailable은 promotion write만 skip/blocked로 기록하며, trace/case/recall 검증 실패와 혼동하지 않는다.
- raw trace 또는 transcript-only data가 MemoryGraph compact fact에 포함되면 완료로 선언하지 않는다.
