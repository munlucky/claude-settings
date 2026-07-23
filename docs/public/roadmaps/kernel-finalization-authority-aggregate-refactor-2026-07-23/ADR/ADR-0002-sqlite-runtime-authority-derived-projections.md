# ADR-0002: SQLite를 Runtime Knowledge Authority로 사용하고 파일은 Derived Projection으로 제한

- Status: Accepted for implementation planning
- Date: 2026-07-23
- Decision Owner: knowledge-runtime

## Context

SQLite transaction을 도입한 뒤에도 run start revision, stage context, ontology evaluation 일부가 JSONL을 읽어 이중 authority가 유지됐다. Projection 실패 또는 revision 불일치가 다음 run의 stale revision을 유발할 수 있다.

## Decision

정상 runtime lifecycle의 모든 knowledge read는 SQLite를 사용한다.

- project revision
- stage context
- ontology constraints
- typed architecture/domain/graph/tacit knowledge
- candidate/review/completion/finalization status

JSON/JSONL은 SQLite committed records에서 생성되는 derived projection으로 제한한다. Runtime fallback은 금지하고 migration/audit/repair command에서만 파일 입력을 허용한다.

## Consequences

- Projection directory가 없어도 runtime이 동작한다.
- Projection 실패가 authority transaction을 취소하지 않는다.
- Legacy JSONL-only data는 explicit import가 필요할 수 있다.
- Typed context loader와 ontology evaluator의 repository dependency가 명확해진다.

## Rejected Alternatives

1. SQLite 우선 + JSONL fallback: 장애 시 오래된 파일이 다시 authority가 된다.
2. Dual write 후 revision 비교: 두 writer 간 crash window가 남는다.
3. JSONL authority 유지: transaction, OCC, referential integrity를 보장하기 어렵다.

## Verification Signals

- runtime source에서 `loadAllProjectRecords()` authority 호출 0
- projection 삭제 후 lifecycle 정상
- rebuild 결과 SQLite committed set/revision과 parity 100%
- typed record가 exact context category로 retrieval
