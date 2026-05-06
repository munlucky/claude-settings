# Phase 03: Failed Turn Case Builder (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-001 | Downloaded plan Summary | 실패 턴을 즉시 ephemeral prevention hint로 남김 | ignored failed turn case cache 생성 |
| TFP-004 | Downloaded plan Failed Turn Case | failed judge result마다 compact case 생성 | schema, builder, validator, CLI output 추가 |
| TFP-008 | Current AWTL baseline | raw trace는 MemoryGraph에 직접 저장하지 않음 | raw-free compact hint와 provenance만 저장 |

## 목표
- 실패한 턴에서 재발 방지에 필요한 compact case를 생성한다.
- case는 장기 메모리가 아니라 ignored cache이며, 다음 run recall의 입력으로만 사용된다.

## 기대 결과
- `.claude/cache/awtl/failed_turn_cases.jsonl`에 failed turn case가 append된다.
- case는 `turn_id`, `failure_event_id`, `artifact_refs`, `memory_read_node_ids`, `prevention_hint`, applicability scope를 갖는다.
- raw stdout/stderr, prompt body, secret-like string은 case에 포함되지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "02-turn-identity-capture"
  conflictsWith:
    - "04-next-run-recall-brief"
    - "05-verified-memory-promotion-replay-scorecard"
  ownedPaths:
    - ".claude/schemas/awtl-failed-turn-case-v1.schema.json"
    - ".claude/scripts/lib/awtl-failed-turn-case.mjs"
    - ".claude/scripts/lib/awtl-failed-turn-case.test.mjs"
    - ".claude/scripts/lib/awtl-failure-attribution.mjs"
    - ".claude/scripts/lib/awtl-memory-candidate.mjs"
    - ".claude/scripts/awtl-failure-analyzer.mjs"
  readOnlyPaths:
    - ".claude/schemas/awtl-memory-candidate-v1.schema.json"
    - ".claude/scripts/lib/awtl-redaction.mjs"
    - ".claude/scripts/lib/awtl-taxonomy.mjs"
  sharedMutablePaths:
    - ".claude/scripts/lib/awtl-failure-attribution.mjs"
    - ".claude/scripts/lib/awtl-memory-candidate.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness_patch"
```

## 범위
- 포함:
  - `awtl-failed-turn-case-v1` schema 추가
  - failed judge result에서 case 생성
  - `failure_turn_id`를 attribution/candidate에 포함
  - ignored cache write helper 추가
- 제외:
  - runner prompt brief injection
  - MemoryGraph write
  - LLM-based root cause generation

## 선행조건과 입력
- Phase 02 완료.
- `judge_result: fail` 또는 hard-blocking completion failure가 attribution input으로 존재해야 한다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P03-1 | failed turn case schema 추가 | 1) required fields 정의 2) additionalProperties 정책 결정 3) confidence/applicability fields 포함 | valid/invalid schema tests pass |
| P03-2 | case builder 구현 | 1) attribution에서 `turn_id` 추출 2) artifact/memory refs 정규화 3) compact prevention hint 생성 | raw body 없이 compact case 생성 |
| P03-3 | candidate와 attribution 확장 | 1) `failure_turn_id`를 memory candidate top-level/scope에 추가 2) evidence refs에 turn provenance 추가 | 기존 candidate tests pass |
| P03-4 | CLI/cache write 연결 | 1) `awtl-failure-analyzer.mjs`에 `--failed-turn-cases-output` 옵션 추가 2) 기본 output `.claude/cache/awtl/failed_turn_cases.jsonl` | analyzer 실행 시 candidate와 case 모두 생성 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P03-1 | `.claude/schemas/awtl-failed-turn-case-v1.schema.json` | none | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs` | schema valid/invalid tests pass |
| P03-2 | `.claude/scripts/lib/awtl-failed-turn-case.mjs` | none | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs` | raw-free prevention hint assertions pass |
| P03-3 | none | `.claude/scripts/lib/awtl-failure-attribution.mjs`, `.claude/scripts/lib/awtl-memory-candidate.mjs`, `.claude/schemas/awtl-memory-candidate-v1.schema.json` | existing attribution/candidate tests | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs` | existing behavior preserved with new field |
| P03-4 | none | `.claude/scripts/awtl-failure-analyzer.mjs` | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --check .claude/scripts/awtl-failure-analyzer.mjs` | syntax pass |

## Blockers And Review
- Blocker condition: case builder includes raw log, prompt body, absolute local path, or secret-like string.
- First review checkpoint: `prevention_hint`가 action-oriented but compact한지 확인한다.
- Re-review trigger: failure taxonomy or attribution shape changes.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/03-failed-turn-case-builder-v1/QA_REPORT.md`

## Critical Product Scenarios
| Scenario | Required Evidence | Pass Signal |
|----------|-------------------|-------------|
| SCN-P03-01 | Synthetic failed judge trace is analyzed by `awtl-failure-analyzer.mjs` | memory candidate and failed-turn case JSONL both contain the same `failure_turn_id` |
| SCN-P03-02 | Failed-turn case output is inspected after persistence | compact case contains artifact and memory provenance but no raw prompt/stdout/stderr payload |

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P03-CASE | Analyzer creates compact turn case records with provenance and raw-free evidence refs. | QA report row marked pass with analyzer CLI and case builder evidence. |

## 검증 계획
- [x] failed case unit: `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs`
- [x] attribution regression: `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs`
- [x] candidate/promotion regression: `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`
- [x] analyzer syntax: `node --check .claude/scripts/awtl-failure-analyzer.mjs`
- [x] policy: `bash .claude/scripts/verify-code-policy.sh`

## 완료 표시용 증거
- QA report에 sample failed turn case JSON을 redacted compact form으로 기록한다.
- raw exclusion assertions 결과를 남긴다.

## 산출물
- failed turn case schema, builder, cache write path
- `failure_turn_id`가 포함된 memory candidate provenance

## Phase 완료 체크리스트
- [x] failed judge에서 case가 생성됨
- [x] case가 ignored cache path에 저장됨
- [x] raw trace/prompt/log 원문이 포함되지 않음
- [x] 검증 체크를 통과함

## 핸드오프 메모
- Phase 04는 이 cache를 read-only로 읽어 prompt brief를 만든다. cache write가 없으면 recall phase는 구현하지 않는다.
