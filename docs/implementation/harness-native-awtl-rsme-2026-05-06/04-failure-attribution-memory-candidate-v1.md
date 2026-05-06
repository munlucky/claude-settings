# Phase 04: Failure Attribution and Memory Candidate (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-002 | Summary Flow | trace -> deterministic attribution -> candidate 흐름 | P04-1, P04-2 |
| AWTL-003 | Summary | LLM은 root cause/proposed memory 문장화에만 사용 | P04-3 |
| AWTL-016 | Phase 3 | deterministic attribution 우선, env/flaky/harness blocked | P04-1, P04-4 |
| AWTL-017 | Memory candidate shape | candidate schema fields와 promotion blockers | P04-2, P04-4 |
| AWTL-020 | Test Plan | memory pollution, promotion precision 검증 | P04-4 |

## 목표
- failed verifier check를 trace event와 touched files에 deterministic하게 연결하고, 검증 가능한 memory candidate를 생성한다.

## 기대 결과
- candidate에는 `source_action_ids`, `failure_type`, `failure_class`, `root_cause_summary`, `proposed_memory`, `scope`, `evidence_refs`, `verification_probe_candidate`, blocker/status가 포함된다.
- environment/flaky/harness failure는 기본적으로 MemoryGraph promotion blocked 상태가 된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "02-schema-trace-sink-foundation-v1"
    - "03-native-harness-capture-v1"
  conflictsWith:
    - "05-replay-gate-memory-promotion-v1"
  ownedPaths:
    - ".claude/schemas/awtl-memory-candidate-v1.schema.json"
    - ".claude/scripts/lib/awtl-failure-attribution.mjs"
    - ".claude/scripts/lib/awtl-memory-candidate.mjs"
    - ".claude/scripts/lib/awtl-failure-attribution.test.mjs"
    - ".claude/scripts/awtl-failure-analyzer.mjs"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/awtl-taxonomy.mjs"
    - ".claude/traces/"
  sharedMutablePaths:
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_attribution"
```

## 범위
- 포함:
  - deterministic attribution chain
  - heuristic fallback with lower confidence
  - LLM attribution boundary adapter placeholder that is disabled by default in tests
  - memory candidate schema and writer to `memory_update_candidates.jsonl`
  - promotion blockers for environment/flaky/harness failures
- 제외:
  - MemoryGraph write
  - replay probe runner
  - raw trace import from external transcripts

## 선행조건과 입력
- 필수 문서:
  - `03-native-harness-capture-v1.md`
- 필수 코드/데이터:
  - `.claude/scripts/lib/awtl-trace-sink.mjs`
  - `.claude/scripts/lib/failure-classifier.mjs`
  - AWTL trace fixture with failed `judge_result`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P04-1 | Deterministic attribution 구현 | 1. failed check artifact/file lookup 2. touched file lookup 3. last modifying action lookup 4. command/verifier adjacency lookup 5. memory_read node ids lookup | fixture에서 expected source action ids가 stable하게 선택됨 |
| P04-2 | Memory candidate schema/writer 구현 | 1. schema 작성 2. candidate id 생성 3. evidence refs 필수화 4. JSONL write | missing scope/evidence/source action/probe candidate가 reject됨 |
| P04-3 | LLM boundary 제한 | 1. raw trace logging에서 LLM 사용 금지 test 2. optional summarizer input을 redacted attribution summary로 제한 | test에서 raw stdout/prompt가 summarizer input에 없음 |
| P04-4 | Promotion blocker 정책 구현 | 1. environment/flaky/harness class blocked 2. confidence/requires_human_review 계산 3. blocker reason 저장 | env/network/flaky fixture가 `promotion_status: blocked` 또는 blocker 포함 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P04-1 | `.claude/scripts/lib/awtl-failure-attribution.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: wrong source action id. Pass: expected attribution chain selected |
| P04-2 | `.claude/schemas/awtl-memory-candidate-v1.schema.json`, `.claude/scripts/lib/awtl-memory-candidate.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: invalid candidate accepted. Pass: missing required fields rejected |
| P04-3 | `.claude/scripts/awtl-failure-analyzer.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --check .claude/scripts/awtl-failure-analyzer.mjs` | Fail: syntax error or raw logging path. Pass: exit 0 |
| P04-4 | none | `.claude/scripts/lib/awtl-memory-candidate.mjs` | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: env failure promotion allowed. Pass: blocked |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P04-1 | Failed verifier check points to the source action that last changed the relevant file | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | deterministic attribution fixture passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-failure-attribution-memory-candidate/QA_REPORT.md` |
| SCN-P04-2 | Candidate without scope, evidence refs, source action ids, or probe candidate cannot be promoted | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | invalid candidate rejection passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-failure-attribution-memory-candidate/QA_REPORT.md` |
| SCN-P04-3 | Network/flaky/environment failure does not become a MemoryGraph fact by default | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | blocked candidate fixture passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-failure-attribution-memory-candidate/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: trace fixtures from Phase 03 do not contain enough action/file/verifier linkage to support deterministic attribution.
- First review checkpoint: after deterministic attribution passes before adding heuristic fallback.
- Re-review trigger: any new failure class or candidate required field.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-failure-attribution-memory-candidate/QA_REPORT.md`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/awtl-failure-analyzer.mjs`
- [ ] Attribution/candidate tests: `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs`
- [ ] Existing classifier tests: `node --test .claude/scripts/lib/failure-classifier.test.mjs`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-failure-attribution-memory-candidate/QA_REPORT.md`
- candidate fixture output path listed in QA report

## 산출물
- `.claude/scripts/lib/awtl-failure-attribution.mjs`
- `.claude/scripts/lib/awtl-memory-candidate.mjs`
- `.claude/scripts/awtl-failure-analyzer.mjs`
- `.claude/schemas/awtl-memory-candidate-v1.schema.json`

## Phase 완료 체크리스트
- [ ] deterministic attribution order is implemented and tested
- [ ] invalid candidates are rejected
- [ ] environment/flaky/harness failures are blocked by default
- [ ] LLM boundary receives only redacted summaries when enabled

## 핸드오프 메모
- Phase 05 must treat Phase 04 candidates as inputs. It must not write directly to MemoryGraph without replay or human approval evidence.
