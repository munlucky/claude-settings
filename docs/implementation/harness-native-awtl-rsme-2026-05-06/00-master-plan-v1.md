# Harness-native AWTL + RSME Master Plan v1

> 이 문서는 `harness-native-awtl-rsme-2026-05-06` 작업의 상위 계획이다.

## 소스 기준선
- `/Users/seokgimoon/Downloads/Harness-native AWTL + RSME 최종 적용 계획.md` (역할: 범위/우선순위 + 기술 계약)
- `README.md` (역할: 하네스 운영 배경)
- `docs/moonshot-phase-runner-user-workflow.md` (역할: phase runner 사용자 흐름)
- `.claude/docs/guidelines/meta-harness-trace.md` (역할: 기존 trace bundle 계약)
- `.claude/docs/guidelines/memorygraph-workflow.md` (역할: MemoryGraph 경계 계약)
- `.claude/verification.contract.yaml` (역할: 검증 계약)

## 소스 갭과 열린 결정
- `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`는 존재하지 않는다. 첨부 문서를 PRD/SPEC 역할의 결합 기준선으로 사용한다.
- `project-memory-agent` read-only plan recall은 MCP transport closed로 확인하지 못했다. 이 계획은 MemoryGraph 원문 없이 저장소 문서와 첨부 문서만 기준으로 작성했다.
- 첨부 문서 제목의 `RSME` 약어는 본문에서 확장 정의되지 않는다. Phase 01에서 용어를 확정하고, 확정 전 코드/파일명에는 `replay`와 `memory-promotion` 같은 본문 기반 명칭을 우선 사용한다.
- 첨부 문서는 failure taxonomy를 "15개 이하"로 정의하라고 하면서 예시 leaf type은 20개를 제시한다. Phase 01에서 leaf type을 15개 이하로 축소하거나, "15개 이하"를 category 수 제한으로 재해석하는 ADR을 남긴다.

## 목표
- AWTL을 하네스 wrapper가 자동 수집하는 action/span 중심 원시 관측 로그로 도입한다.
- raw trace와 Project MemoryGraph를 분리하고, MemoryGraph에는 replay 또는 human approval을 통과한 compact fact만 승격한다.
- command, verifier, memory read, file reconciliation, run boundary를 LLM 없이 자동 기록한다.
- 실패가 발생한 뒤 deterministic attribution을 우선 적용하고, LLM은 root cause 설명과 memory 문장화에만 제한적으로 사용한다.
- privacy는 fail-closed로 처리하고, logging failure는 본 작업 verdict를 오염시키지 않는 warning-only 경계로 둔다.
- Codex/Claude transcript importer는 normalized event backfill 용도로만 제공하고, imported event 단독으로 MemoryGraph promotion을 허용하지 않는다.

## Non-goals
- AWTL raw trace를 MemoryGraph에 직접 저장하지 않는다.
- raw prompt 전문, full reasoning, full stdout/stderr, secret/env/token 원문, local absolute cwd 원문을 저장하지 않는다.
- 기존 `meta-harness-trace` bundle을 즉시 삭제하거나 교체하지 않는다. AWTL은 canonical event log이고 기존 bundle은 필요 시 materialized view 또는 compatibility artifact로 유지한다.
- 하네스 verification contract를 완화하거나 실패를 fake pass 처리하지 않는다.
- v1에서 SQLite WAL을 구현하지 않는다. v1 storage는 JSONL + lock file이며 SQLite WAL은 v2 확장으로 둔다.

## Plan Review 요약
```yaml
planCeoReview:
  artifact: "docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md"
  verdict: "conditional_pass"
  summary: "하네스 실패 학습과 메모리 오염 방지 가치가 명확하지만 v1은 JSONL 기반 canonical trace와 promotion gate까지만 제한해야 한다."
  requiredChanges:
    - "RSME 약어와 taxonomy 개수 충돌을 Phase 01의 열린 결정으로 고정한다."
    - "SQLite WAL, 자동 MemoryGraph write, transcript-only promotion은 v1 scope에서 제외한다."
  blockers: []
planEngReview:
  artifact: "docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md"
  verdict: "conditional_pass"
  summary: "실행 가능하지만 shared harness runtime을 건드리므로 schema/sink/capture/attribution/promotion 순서를 엄격히 유지해야 한다."
  requiredChanges:
    - "각 phase의 ownedPaths와 dependsOn을 명시한다."
    - "privacy fail-closed와 MemoryGraph boundary 검증을 phase별 SCN으로 둔다."
    - "existing meta-harness trace와 AWTL canonical event source의 관계를 Phase 02/03에서 검증한다."
  blockers: []
```

## Phase 인덱스
| Phase | 제목 | 계획 파일 | 선행 의존성 |
|---|---|---|---|
| 01 | Taxonomy, Privacy, and Provenance Contract | `docs/implementation/harness-native-awtl-rsme-2026-05-06/01-taxonomy-privacy-provenance-v1.md` | - |
| 02 | Schema and Trace Sink Foundation | `docs/implementation/harness-native-awtl-rsme-2026-05-06/02-schema-trace-sink-foundation-v1.md` | Phase 01 |
| 03 | Native Harness Capture | `docs/implementation/harness-native-awtl-rsme-2026-05-06/03-native-harness-capture-v1.md` | Phase 02 |
| 04 | Failure Attribution and Memory Candidate | `docs/implementation/harness-native-awtl-rsme-2026-05-06/04-failure-attribution-memory-candidate-v1.md` | Phase 02, Phase 03 |
| 05 | Replay Gate and Memory Promotion | `docs/implementation/harness-native-awtl-rsme-2026-05-06/05-replay-gate-memory-promotion-v1.md` | Phase 04 |
| 06 | Runtime Importers and Regression Hardening | `docs/implementation/harness-native-awtl-rsme-2026-05-06/06-runtime-importers-regression-hardening-v1.md` | Phase 02 |

## 실행 순서 메모
- Phase 01은 terminology, taxonomy, privacy, provenance를 고정하므로 모든 구현의 선행 조건이다.
- Phase 02는 canonical event schema와 append-only sink를 만든다. 이후 phase는 이 sink를 read/write contract로 사용한다.
- Phase 03은 phase runner와 command/verifier wrappers를 수정하므로 Phase 02가 완료된 뒤 실행한다.
- Phase 04는 Phase 03에서 생성되는 source action ids와 judge_result를 attribution 입력으로 사용한다.
- Phase 05는 Phase 04의 memory candidate가 있어야 promotion gate를 검증할 수 있다.
- Phase 06은 Phase 02 이후 importer를 병렬 개발할 수 있지만, 최종 회귀 검증은 Phase 03-05 완료 후 다시 실행한다.

## 병렬 실행 계획
| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | shared terminology, taxonomy, privacy, provenance 결정 |
| wave-2 | 02 | sequential | canonical schema/sink 없이는 downstream capture/attribution 불가 |
| wave-3 | 03, 06 | conditional parallel | Phase 06 importer 파일은 disjoint ownership이면 Phase 03과 병렬 가능. 최종 regression은 sequential 재검증 필요 |
| wave-4 | 04 | sequential | source action ids, judge_result, file reconciliation event 필요 |
| wave-5 | 05 | sequential | memory candidate와 promotion blocker contract 필요 |
| closeout | 06 final regression | sequential | 모든 phase 산출물과 docs sync 확인 |

## 소스 추적 매트릭스
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| AWTL-001 | 첨부 Summary | AWTL은 action/span raw observation이고 MemoryGraph는 검증/승격된 compact 장기 지식만 저장 | 01 | `01-taxonomy-privacy-provenance-v1.md` | mapped |
| AWTL-002 | 첨부 Summary | Trace -> deterministic attribution -> memory candidate -> replay/human approval -> MemoryGraph compact fact 흐름 | 04, 05 | `04-failure-attribution-memory-candidate-v1.md`, `05-replay-gate-memory-promotion-v1.md` | mapped |
| AWTL-003 | 첨부 Summary | LLM은 raw logging에 쓰지 않고 실패 이후 distillation에만 선택 사용 | 03, 04 | `03-native-harness-capture-v1.md`, `04-failure-attribution-memory-candidate-v1.md` | mapped |
| AWTL-004 | Canonical Event Model | v1 event 최소 단위는 span/action이며 turn_id는 optional | 02 | `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-005 | Canonical Event Model | common envelope 필드와 ordering 기준을 구현 | 02 | `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-006 | Canonical Event Model | required event types를 지원 | 02, 03 | `02-schema-trace-sink-foundation-v1.md`, `03-native-harness-capture-v1.md` | mapped |
| AWTL-007 | Trace Store | v1 trace store는 `.claude/traces/<run-id>/` JSONL + lock file이며 `agent_work_trace.jsonl`이 canonical source | 02 | `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-008 | Trace Store | `judge_result.jsonl`은 convenience index/materialized view로만 둠 | 02, 03 | `02-schema-trace-sink-foundation-v1.md`, `03-native-harness-capture-v1.md` | mapped |
| AWTL-009 | Trace Store | `.claude/traces/`는 git ignored artifact | 01, 02 | `01-taxonomy-privacy-provenance-v1.md`, `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-010 | Privacy Policy | redaction fail-closed, secret/logging failure policy, 금지/허용 저장 항목 | 01, 02 | `01-taxonomy-privacy-provenance-v1.md`, `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-011 | MemoryGraph Boundary | raw trace는 MemoryGraph에 저장하지 않고 승인된 compact fact만 provenance tag와 함께 저장 | 01, 05 | `01-taxonomy-privacy-provenance-v1.md`, `05-replay-gate-memory-promotion-v1.md` | mapped |
| AWTL-012 | MemoryGraph Boundary | `project-memory-agent`는 AWTL 원문을 직접 조회하지 않고 승격된 MemoryGraph delta만 읽음 | 01, 05 | `01-taxonomy-privacy-provenance-v1.md`, `05-replay-gate-memory-promotion-v1.md` | mapped |
| AWTL-013 | Phase 0 | failure taxonomy v1, privacy redaction pattern, provenance metadata 정책 확정 | 01 | `01-taxonomy-privacy-provenance-v1.md` | mapped |
| AWTL-014 | Phase 1 | JSON schema, append-only sink, ingest_seq/writer_seq/lock/quarantine/redaction helper | 02 | `02-schema-trace-sink-foundation-v1.md` | mapped |
| AWTL-015 | Phase 2 | run/attempt/span, command, verifier, memory read, file reconciliation native capture | 03 | `03-native-harness-capture-v1.md` | mapped |
| AWTL-016 | Phase 3 | deterministic attribution 우선, heuristic 보조, LLM 제한, env/flaky/harness promotion blocked | 04 | `04-failure-attribution-memory-candidate-v1.md` | mapped |
| AWTL-017 | Phase 3 | memory candidate schema와 required fields를 구현 | 04 | `04-failure-attribution-memory-candidate-v1.md` | mapped |
| AWTL-018 | Phase 4 | easy/hard/regression probe manifest와 replay/human approval promotion gate | 05 | `05-replay-gate-memory-promotion-v1.md` | mapped |
| AWTL-019 | Phase 5 | Codex rollout/session importer와 Claude Code transcript importer를 normalized schema에 맞춤 | 06 | `06-runtime-importers-regression-hardening-v1.md` | mapped |
| AWTL-020 | Test Plan | schema, ordering, crash consistency, redaction, command/verifier capture, memory boundary, pollution, precision, regression 검증 | 02-06 | all phase files | mapped |

## 매핑되지 않은 소스 요구사항
- 없음. 단, `RSME` 약어와 taxonomy 개수 충돌은 소스 요구사항 누락이 아니라 Phase 01의 열린 결정으로 추적한다.

## Phase 완료 체크리스트
- [x] Phase 01 - Taxonomy, Privacy, and Provenance Contract (`01-taxonomy-privacy-provenance-v1.md`)
- [x] Phase 02 - Schema and Trace Sink Foundation (`02-schema-trace-sink-foundation-v1.md`)
- [x] Phase 03 - Native Harness Capture (`03-native-harness-capture-v1.md`)
- [x] Phase 04 - Failure Attribution and Memory Candidate (`04-failure-attribution-memory-candidate-v1.md`)
- [ ] Phase 05 - Replay Gate and Memory Promotion (`05-replay-gate-memory-promotion-v1.md`)
- [ ] Phase 06 - Runtime Importers and Regression Hardening (`06-runtime-importers-regression-hardening-v1.md`)

## 완료 규칙
- 각 phase 계획의 완료 기준과 fresh verification evidence가 충족될 때만 체크한다.
- AWTL raw trace가 MemoryGraph에 직접 저장되면 완료로 선언하지 않는다.
- secret-like payload가 excerpt에 남거나 full stdout/stderr가 저장되면 완료로 선언하지 않는다.
- logging failure가 main task verdict를 fail/pass로 오염시키면 완료로 선언하지 않는다.
- imported transcript event만으로 MemoryGraph promotion이 가능하면 완료로 선언하지 않는다.
