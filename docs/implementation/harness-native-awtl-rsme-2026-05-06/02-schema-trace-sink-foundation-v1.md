# Phase 02: Schema and Trace Sink Foundation (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-004 | Canonical Event Model | 최소 단위는 span/action, turn_id optional | P02-1 |
| AWTL-005 | Canonical Event Model | envelope fields와 ordering 기준 | P02-1, P02-2 |
| AWTL-006 | Canonical Event Model | required event types 지원 | P02-1 |
| AWTL-007 | Trace Store | JSONL + lock file, canonical `agent_work_trace.jsonl` | P02-2 |
| AWTL-008 | Trace Store | `judge_result.jsonl`은 materialized view | P02-3 |
| AWTL-010 | Privacy Policy | redaction/hash/artifact-ref helper 사용 | P02-2 |
| AWTL-014 | Phase 1 | schema, sink, seq, quarantine, helper 구현 | P02-1, P02-2, P02-3 |
| AWTL-020 | Test Plan | schema/order/crash/redaction 검증 | P02-4 |

## 목표
- `awtl.event.v1` JSON schema와 append-only trace sink를 구현한다.
- parallel append, corrupt-line quarantine, redaction helper integration을 검증한다.

## 기대 결과
- 후속 phase가 동일 API로 AWTL event를 기록할 수 있다.
- `agent_work_trace.jsonl`과 `judge_result.jsonl`의 source-of-truth 관계가 코드와 문서에서 분리된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01-taxonomy-privacy-provenance-v1"
  conflictsWith:
    - "03-native-harness-capture-v1"
    - "04-failure-attribution-memory-candidate-v1"
  ownedPaths:
    - ".claude/schemas/awtl-event-v1.schema.json"
    - ".claude/scripts/lib/awtl-event-schema.mjs"
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
    - ".claude/scripts/lib/awtl-trace-sink.test.mjs"
    - ".claude/scripts/awtl-trace.mjs"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-redaction.mjs"
    - ".claude/scripts/lib/awtl-taxonomy.mjs"
    - ".claude/scripts/meta-harness-trace.mjs"
    - ".claude/docs/guidelines/meta-harness-trace.md"
  sharedMutablePaths:
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_schema_foundation"
```

## 범위
- 포함:
  - `awtl.event.v1` schema
  - event ordering helper: `run_id -> ingest_seq -> timestamp -> event_id`
  - lock-file based append sink
  - corrupt partial line quarantine
  - redacted excerpt/hash/artifact_refs write path
  - `judge_result.jsonl` materialized view writer
- 제외:
  - phase runner runtime hook 연결
  - attribution algorithm
  - replay/promotion gate

## 선행조건과 입력
- 필수 문서:
  - `01-taxonomy-privacy-provenance-v1.md`
- 필수 코드/데이터:
  - `.claude/scripts/lib/awtl-redaction.mjs`
  - `.claude/scripts/lib/awtl-taxonomy.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P02-1 | Event schema 작성 | 1. common envelope 필수/optional 필드 작성 2. required event type enum 작성 3. event-specific payload 최소 shape 정의 | schema validator가 required fields 누락을 reject함 |
| P02-2 | Append-only sink 구현 | 1. run directory 생성 2. lock 획득 3. ingest_seq/writer_seq 할당 4. JSONL append 5. corrupt line quarantine | parallel append test에서 JSONL line count와 parse가 안정적임 |
| P02-3 | Materialized view writer 구현 | 1. `judge_result` event를 canonical log에 기록 2. 별도 `judge_result.jsonl` index 생성 3. index 재생성 command 제공 | canonical log 없이 index만 source로 쓰지 않는 test가 있음 |
| P02-4 | Crash/privacy regression 추가 | 1. partial write fixture 2. secret payload fixture 3. timestamp 역전 ordering fixture | quarantine, redaction, ordering tests가 통과함 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P02-1 | `.claude/schemas/awtl-event-v1.schema.json`, `.claude/scripts/lib/awtl-event-schema.mjs` | none | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | Fail: missing fields accepted. Pass: schema tests reject invalid events |
| P02-2 | `.claude/scripts/lib/awtl-trace-sink.mjs` | none | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | Fail: corrupt JSONL or duplicate seq. Pass: parallel append is parseable |
| P02-3 | `.claude/scripts/awtl-trace.mjs` | `.claude/scripts/lib/awtl-trace-sink.mjs` | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node .claude/scripts/awtl-trace.mjs self-test` | Fail: canonical/index mismatch. Pass: self-test exits 0 |
| P02-4 | none | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md` | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node --check .claude/scripts/awtl-trace.mjs` | Fail: syntax error. Pass: exit 0 |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P02-1 | A maintainer can run a self-test and see a valid AWTL trace directory created under ignored `.claude/traces/` | `node .claude/scripts/awtl-trace.mjs self-test` | self-test exits 0 and reports trace path | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-schema-trace-sink-foundation/QA_REPORT.md` |
| SCN-P02-2 | Parallel append does not corrupt `agent_work_trace.jsonl` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | parallel append test passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-schema-trace-sink-foundation/QA_REPORT.md` |
| SCN-P02-3 | Secret-like stdout/stderr is hashed or dropped, not stored as excerpt | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | redaction test passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-schema-trace-sink-foundation/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: Node standard library alone cannot safely validate the schema without adding a new dependency; implementation must either use a small local validator or explicitly justify dependency addition.
- First review checkpoint: after schema and sink API exist, before Phase 03 imports them.
- Re-review trigger: any event envelope field changes after Phase 03 starts.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-schema-trace-sink-foundation/QA_REPORT.md`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/awtl-trace.mjs`
- [ ] Unit/self-test: `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs`
- [ ] CLI self-test: `node .claude/scripts/awtl-trace.mjs self-test`
- [ ] Shell/doc contract: `bash .claude/scripts/knowledge-repo-audit.sh`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-schema-trace-sink-foundation/QA_REPORT.md`
- `.claude/traces/<self-test-run>/agent_work_trace.jsonl` path reference, not committed content

## 산출물
- `.claude/schemas/awtl-event-v1.schema.json`
- `.claude/scripts/lib/awtl-event-schema.mjs`
- `.claude/scripts/lib/awtl-trace-sink.mjs`
- `.claude/scripts/awtl-trace.mjs`

## Phase 완료 체크리스트
- [ ] schema rejects missing required envelope fields
- [ ] append-only sink passes parallel append and quarantine tests
- [ ] `judge_result.jsonl` is generated only as materialized view
- [ ] redaction helper is applied before event write

## 핸드오프 메모
- Phase 03 must use only the public sink API from `awtl-trace-sink.mjs`; it should not write JSONL directly.
