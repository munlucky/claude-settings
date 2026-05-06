# Phase 05: Verified Memory Promotion And Replay Scorecard (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-006 | Downloaded plan Memory Promotion | replay/approval 통과 후보만 MemoryGraph write | promotion gate denial codes와 direct write CLI 추가 |
| TFP-007 | Downloaded plan Replay Scorecard | replay/promotion 결과를 scorecard로 누적 | `.claude/cache/awtl/replay_scorecard.jsonl` 추가 |
| TFP-008 | Current AWTL baseline | raw trace는 MemoryGraph에 직접 저장하지 않음 | compact fact and provenance-only write |
| TFP-009 | Repo constraints | MemoryGraph transport failure는 workflow closeout을 막지 않음 | unavailable은 denial/skip으로 기록 |

## 목표
- 기존 `write_status: not_implemented`를 실제 CLI write path 또는 explicit skip/blocked 상태로 바꾼다.
- MemoryGraph write는 replay pass 또는 human approval이 있을 때만 수행한다.
- replay/promotion decision을 scorecard에 남기고 next-run recall에서 stale/risky hint를 제외할 수 있게 한다.

## 기대 결과
- `awtl-memory-promotion.mjs --write-memorygraph --auto-promote verified-only`가 replay pass candidate만 direct `store_memory` 경로로 보낸다.
- imported-only, transcript-only, raw-trace, environment/flaky/harness failure는 denial code로 차단된다.
- MemoryGraph unavailable은 `memorygraph_unavailable` denial/skip으로 기록되고 main workflow를 오염시키지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "03-failed-turn-case-builder"
  conflictsWith:
    - "04-next-run-recall-brief"
    - "06-regression-contract-docs-sync"
  ownedPaths:
    - ".claude/scripts/lib/awtl-memory-promotion.mjs"
    - ".claude/scripts/lib/awtl-memory-promotion.test.mjs"
    - ".claude/scripts/awtl-memory-promotion.mjs"
    - ".claude/scripts/lib/awtl-replay-scorecard.mjs"
    - ".claude/scripts/lib/awtl-replay-scorecard.test.mjs"
    - ".claude/schemas/awtl-memory-candidate-v1.schema.json"
    - ".claude/scripts/lib/awtl-failure-prevention-brief.mjs"
  readOnlyPaths:
    - ".claude/scripts/memorygraph-direct.mjs"
    - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
    - ".claude/scripts/lib/awtl-replay-probes.mjs"
  sharedMutablePaths:
    - ".claude/scripts/lib/awtl-memory-promotion.mjs"
    - ".claude/scripts/lib/awtl-failure-prevention-brief.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness_patch"
```

## 범위
- 포함:
  - candidate schema에 `failure_turn_id`, `applies_to`, `does_not_apply_to`, `denial_codes`, `validated_by`, `last_validated_at` 추가
  - machine-readable denial code mapping
  - `memorygraph-direct.mjs store_memory` subprocess call path
  - replay scorecard append/read helper
  - recall matcher의 scorecard stale/risky exclusion
- 제외:
  - normal phase run에서 자동 write
  - MCP transport 재시작/프로세스 kill
  - raw trace write

## 선행조건과 입력
- Phase 03 완료.
- Phase 04 완료가 있으면 scorecard filter integration까지 수행한다. Phase 04 미완료 시 filter integration은 blocked로 기록한다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P05-1 | denial codes 추가 | 1) gate reasons를 stable code로 매핑 2) tests update 3) output에 `denial_codes` 포함 | blocked cases return expected codes |
| P05-2 | compact fact provenance 확장 | 1) `origin_turn`, `applies_to`, `does_not_apply_to`, validation metadata 추가 2) raw-free assertion | compact fact contains provenance only |
| P05-3 | direct write CLI 추가 | 1) `--write-memorygraph` 2) `--auto-promote verified-only` 3) memorygraph unavailable handling | write attempted only for promotable candidates |
| P05-4 | replay scorecard 추가 | 1) schema-less helper with required fields 2) append/read latest decisions 3) recall filter hook | scorecard append/read tests pass |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P05-1 | none | `.claude/scripts/lib/awtl-memory-promotion.mjs`, `.claude/schemas/awtl-memory-candidate-v1.schema.json` | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | denial code assertions pass |
| P05-2 | none | `.claude/scripts/lib/awtl-memory-promotion.mjs` | `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs` | compact fact includes origin_turn and no raw trace |
| P05-3 | none | `.claude/scripts/awtl-memory-promotion.mjs` | existing promotion tests | `node --check .claude/scripts/awtl-memory-promotion.mjs` | CLI syntax pass |
| P05-4 | `.claude/scripts/lib/awtl-replay-scorecard.mjs` | `.claude/scripts/lib/awtl-failure-prevention-brief.mjs` | `.claude/scripts/lib/awtl-replay-scorecard.test.mjs`, `.claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | `node --test .claude/scripts/lib/awtl-replay-scorecard.test.mjs .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` | scorecard and filter tests pass |

## Blockers And Review
- Blocker condition: default promotion command writes to MemoryGraph without explicit `--write-memorygraph`.
- First review checkpoint: unavailable MemoryGraph must produce a recorded skip/denial, not a fake pass or fatal workflow stop.
- Re-review trigger: `memorygraph-direct.mjs` CLI contract changes.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/05-verified-memory-promotion-replay-scorecard-v1/QA_REPORT.md`

## Critical Product Scenarios
| Scenario | Required Evidence | Pass Signal |
|----------|-------------------|-------------|
| SCN-P05-01 | Candidate lacks replay pass or approval | promotion gate emits stable denial codes and no MemoryGraph write |
| SCN-P05-02 | Candidate has compact provenance | compact fact includes `origin_turn`, `applies_to`, validation metadata, and no raw trace |
| SCN-P05-03 | Replay scorecard marks a case stale or risky | recall matcher excludes that case |
| SCN-P05-04 | MemoryGraph direct health is checked | unavailable/healthy state is recorded without blocking unrelated workflow |

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P05-PROMOTION | Promotion gate records replay decisions and writes only verified or approved compact facts. | QA report row marked pass with promotion and scorecard evidence. |

## 검증 계획
- [x] promotion unit: `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`
- [x] scorecard unit: `node --test .claude/scripts/lib/awtl-replay-scorecard.test.mjs`
- [x] recall filter regression: `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs`
- [x] CLI syntax: `node --check .claude/scripts/awtl-memory-promotion.mjs`
- [x] direct fallback smoke if available: `node .claude/scripts/memorygraph-direct.mjs health`

## 완료 표시용 증거
- QA report에 no-write default, blocked denial code, verified-only write path, unavailable skip 결과를 기록한다.
- Scorecard sample record를 raw-free form으로 기록한다.

## 산출물
- verified-only MemoryGraph promotion path
- replay scorecard cache and recall filter integration

## Phase 완료 체크리스트
- [x] denial codes가 machine-readable로 출력됨
- [x] default path는 MemoryGraph에 write하지 않음
- [x] verified-only explicit flag에서만 direct write를 시도함
- [x] replay scorecard가 기록되고 recall filter에 반영됨
- [x] 검증 체크를 통과함

## 핸드오프 메모
- Phase 06에서 docs, parity, closeout contract를 업데이트한다. MemoryGraph live write가 환경 문제로 실패하면 failure가 아니라 unavailable skip evidence로 분리한다.
