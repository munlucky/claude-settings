# Kernel Finalization Authority Aggregate Refactor Traceability Matrix

| Requirement | Decision | Phase | Owner | Primary Evidence | Verification Signal | Status |
|---|---|---|---|---|---|---|
| FAR-REQ-001 `finalizeRun()`만 completion authority를 기록한다 | ADR-0001 | PH-01, PH-03, PH-05 | finalization-authority | public API inventory, completion row audit | VS-sole-completion-writer | planned |
| FAR-REQ-002 blocked readiness는 run을 `PROVE`에 유지한다 | ADR-0001 | PH-01, PH-02, PH-03 | finalization-domain | blocked/retry state matrix | VS-blocked-run-remains-prove | planned |
| FAR-REQ-003 candidate, evidence, approval, obligation, review를 aggregate로 결합한다 | ADR-0001 | PH-02 | finalization-domain | candidate lifecycle and FK report | VS-candidate-binding-order | planned |
| FAR-REQ-004 completion과 knowledge authority를 단일 SQLite transaction으로 commit한다 | ADR-0001 | PH-03 | persistence-recovery | atomicity and rollback report | VS-all-or-nothing-authority | planned |
| FAR-REQ-005 verified candidate를 canonical committed typed record로 변환한다 | ADR-0001, ADR-0002 | PH-03, PH-04 | knowledge-runtime | canonical record matrix | VS-canonical-typed-record | planned |
| FAR-REQ-006 runtime knowledge read authority는 SQLite다 | ADR-0002 | PH-04 | knowledge-runtime | runtime caller inventory | VS-sqlite-only-runtime-read | planned |
| FAR-REQ-007 JSON/JSONL projection은 SQLite에서 완전 재생성 가능하다 | ADR-0002 | PH-04 | projection-recovery | deletion/rebuild equivalence | VS-projection-rebuild-parity | planned |
| FAR-REQ-008 Git closeout은 outbox exact-SHA delivery와 idempotent retry를 사용한다 | ADR-0003 | PH-05 | git-delivery-and-closeout | local bare remote state machine | VS-explicit-sha-retry | planned |
| FAR-REQ-009 blocker tests는 실제 SQLite/Git resource를 사용한 invariant test다 | ADR-0001, ADR-0003 | PH-01-PH-05 | kernel-integration-tests | test quality classification and final invariant report | VS-real-invariant-suite | planned |
| FAR-REQ-010 legacy authority mutation surface를 제거한다 | ADR-0001 | PH-03, PH-05 | finalization-authority | public surface audit | VS-legacy-surface-zero | planned |

## Scenario Coverage

| Scenario | Requirements | Phase | Expected Result |
|---|---|---|---|
| FAR-SCN-001 status/assess/legacy API authority 우회 시도 | 001, 010 | PH-01, PH-03, PH-05 | completion row 증가 0 |
| FAR-SCN-002 proof 부족 상태에서 prepare/finalize 시도 | 002 | PH-01, PH-02, PH-03 | blocked, run state `PROVE`, 추가 proof 가능 |
| FAR-SCN-003 candidate 명시 evidence binding | 003 | PH-02 | candidate row 이후 valid binding 저장, stale/foreign evidence 거부 |
| FAR-SCN-004 ask-first candidate 승인 | 003 | PH-02 | 1차 prepare blocked → 별도 approval → 2차 prepare ready |
| FAR-SCN-005 invariant dynamic obligation | 003 | PH-02 | required → proof passed → candidate verified |
| FAR-SCN-006 change transaction | 001, 004, 005 | PH-03 | completion/records/revision/receipts all-or-nothing |
| FAR-SCN-007 no-change transaction | 004 | PH-03 | revision 유지, transaction/receipt 존재 |
| FAR-SCN-008 concurrent finalization | 004 | PH-03 | independent DB connections 중 하나만 성공 |
| FAR-SCN-009 fault after record insert | 004 | PH-03 | records/revision/receipts/run state 모두 rollback |
| FAR-SCN-010 typed architecture/domain/graph/ontology/tacit retrieval | 005, 006 | PH-04 | exact context category와 stage policy 적용 |
| FAR-SCN-011 projection directory 삭제 | 006, 007 | PH-04 | runtime 정상, rebuild 후 SQLite parity |
| FAR-SCN-012 projection write 실패 후 다음 run | 006, 007 | PH-04 | SQLite revision 사용, stale file로 차단되지 않음 |
| FAR-SCN-013 Git commit 후 push 실패 | 008 | PH-05 | commit_created/push_failed receipt에 SHA 보존 |
| FAR-SCN-014 Git retry | 008 | PH-05 | 동일 SHA push, commit count 증가 없음 |
| FAR-SCN-015 Git closeout postconditions | 008, 009 | PH-05 | HEAD/index/selected clean, unselected changes 보존 |

## Owner and Verification Signal Map

| Owner | Responsibilities | Signals |
|---|---|---|
| finalization-architecture | aggregate boundary and ADR consistency | VS-public-authority-inventory |
| finalization-domain | prepare, candidate lifecycle, readiness | VS-prepare-reentrant, VS-blocked-run-remains-prove |
| finalization-authority | atomic commit and public surface | VS-sole-completion-writer, VS-all-or-nothing-authority |
| persistence-recovery | OCC, rollback, migration compatibility | VS-multi-connection-occ, VS-fault-rollback |
| knowledge-runtime | canonical records and SQLite context | VS-canonical-typed-record, VS-sqlite-only-runtime-read |
| projection-recovery | rebuild and failure recovery | VS-projection-rebuild-parity |
| git-delivery-and-closeout | outbox, exact SHA, index postconditions | VS-git-outbox-state-machine, VS-explicit-sha-retry |
| independent-reviewer | blocker confirmation and promotion review | VS-independent-review-pass |
