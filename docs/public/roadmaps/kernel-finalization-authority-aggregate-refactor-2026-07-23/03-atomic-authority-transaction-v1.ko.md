# Phase 03 - Atomic Authority Transaction

## Objective

Completion decision, canonical knowledge records, knowledge revision, knowledge transaction, knowledge receipt, finalization authority receipt를 하나의 SQLite transaction으로 확정한다. Caller가 evaluation 또는 candidate payload를 주입하는 우회 API를 제거한다.

## Phase Execution Metadata

```yaml
phaseExecutionMetadata:
  phaseId: PH-03
  dependsOn: [PH-02]
  executionMode: sequential
  entryState: aggregate_prepare_ready
  exitState: atomic_authority_ready
  owners:
    primary: finalization-authority
    verification: persistence-recovery
  verificationSignals:
    - VS-sole-completion-writer
    - VS-all-or-nothing-authority
    - VS-canonical-typed-record
    - VS-multi-connection-occ
    - VS-fault-rollback
```

## Surface Classification

- `source_only`: coordinator, authority commit, canonical record mapper, tests.
- `data_or_state_migration`: transaction schema/index changes and compatibility facade; disposable runtimeHome required.

## Owned Paths

```text
scripts/kernel/finalization/coordinator.mjs
scripts/kernel/finalization/authority-commit.mjs
scripts/kernel/knowledge/canonical-record.mjs
scripts/kernel/persistence/transaction.mjs
scripts/kernel/persistence/run-repository.mjs
scripts/kernel/persistence/knowledge-repository.mjs
scripts/kernel/persistence/finalization-repository.mjs
scripts/kernel/control-plane.mjs
scripts/kernel/state-store.mjs
scripts/kernel/knowledge/commit.mjs
tests/kernel-finalization-authority-transaction.test.mjs
tests/kernel-finalization-authority-rollback.test.mjs
tests/kernel-finalization-authority-concurrency.test.mjs
tests/kernel-finalization-canonical-record.test.mjs
```

## Read-Only Paths

```text
scripts/kernel/finalization/prepare.mjs
scripts/kernel/finalization/readiness.mjs
scripts/kernel/knowledge/records.mjs
schemas/verification.contract.yaml
```

## Write-Set Boundary

- Git, projection files, package payload는 변경하지 않는다.
- Authority transaction 외부에서 completion/knowledge/finalization receipt를 쓰는 코드는 제거 대상이다.
- Legacy facade는 read compatibility만 유지한다.

## Work

1. `finalizeRun()`을 `prepare → authority commit → derived side effects schedule` coordinator로 축소한다.
2. `commitFinalizationAuthority(runId, expected)`를 구현한다.
3. Transaction 시작 후 run, mutation revision, candidates, bindings, approvals, static/dynamic obligations, acceptance coverage, release evidence를 다시 읽는다.
4. Readiness를 transaction 내부에서 다시 계산하고 ready가 아니면 mutation 없이 rollback한다.
5. Run이 `PROVE`인지 검증한 뒤 transaction 내부에서만 `CLOSE`로 전이한다.
6. Completion decision을 내부 계산하고 caller-authored evaluation을 받지 않는다.
7. Verified candidate를 `materializeCanonicalKnowledgeRecord()`로 변환한다.
8. Canonical record는 `status=committed`, `trustTier=verified`, canonical type, evidence bindings를 필수로 가진다.
9. Expected knowledge revision CAS를 적용한다.
10. Change와 no-change 모두 `knowledge_transactions` row를 남긴다.
11. Completion decision, knowledge receipt, finalization authority receipt, run completed를 같은 transaction에 저장한다.
12. Transaction 반환 receipt와 SQLite authoritative receipt가 byte-equivalent canonical payload/digest를 사용하도록 통일한다.
13. 다음 public/legacy 경로를 제거하거나 read-only로 축소한다.
    - `persistCompletionDecision(runId, evaluation)`
    - `recordCompletionDecision()` public surface
    - `commitProjectKnowledge(...candidates)`
    - `commitKnowledgeTransaction()` public surface
    - `recordKnowledgeCommitReceipt()` external call
    - public `closeRun()`
14. State store는 persistence facade로 축소하고 policy calculation을 finalization domain으로 이동한다.

## Atomic Transaction Contract

```text
BEGIN IMMEDIATE
  validate run and revision
  validate prepare aggregate
  validate approval/evidence/obligations
  transition PROVE → CLOSE
  insert completion_decision
  upsert canonical knowledge_records
  CAS knowledge_revision
  insert knowledge_transaction
  insert knowledge_commit_receipt
  insert finalization_authority_receipt
  update run completed
COMMIT
```

## Acceptance Criteria

- Public completion writer는 `finalizeRun()` 하나다.
- Fabricated evaluation 또는 caller candidate로 accepted completion/knowledge commit을 만들 수 없다.
- Review receipt가 없으면 authority commit이 fail-closed한다.
- Blocked readiness에서 `CLOSE` 전이와 completion row가 발생하지 않는다.
- Completion, knowledge receipt, finalization authority receipt는 모두 존재하거나 모두 존재하지 않는다.
- No-change도 transaction audit row와 authoritative receipt를 가진다.
- 두 독립 DB connection이 같은 revision으로 commit하면 하나만 성공한다.
- Record insert 이후 fault injection은 records/revision/receipts/run state를 모두 rollback한다.

## Spec-Test Obligations

- FAR-REQ-001, FAR-REQ-004, FAR-REQ-005
- FAR-SCN-001, FAR-SCN-006, FAR-SCN-007, FAR-SCN-008

## Verification

```bash
node --test tests/kernel-finalization-authority-transaction.test.mjs tests/kernel-finalization-authority-rollback.test.mjs tests/kernel-finalization-authority-concurrency.test.mjs tests/kernel-finalization-canonical-record.test.mjs
npm run test:kernel
npm test
```

## Evidence

```text
artifacts/kernel/finalization-refactor/phase-03/authority-atomicity.json
artifacts/kernel/finalization-refactor/phase-03/concurrency-results.json
artifacts/kernel/finalization-refactor/phase-03/fault-rollback.json
artifacts/kernel/finalization-refactor/phase-03/canonical-record-matrix.json
artifacts/kernel/finalization-refactor/phase-03/public-authority-surface.json
```

## Risks and Rollback

- Transaction schema 변경은 additive migration 후 새 coordinator가 준비됐을 때 routing을 전환한다.
- Routing 전환 실패 시 신규 coordinator를 비활성화하고 기존 branch commit으로 되돌린다. Partial DB migration은 새 테이블을 보존해도 기존 reader에 영향을 주지 않아야 한다.
