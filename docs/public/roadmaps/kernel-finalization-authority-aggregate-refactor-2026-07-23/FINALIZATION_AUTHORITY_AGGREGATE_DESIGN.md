# Finalization Authority Aggregate 설계

## 1. 문제 정의

현재 finalization은 Control Plane, state store, knowledge review, knowledge commit, projection, Git closeout에 분산되어 있다. 각 모듈이 부분 authority를 소유하면서 다음 문제가 반복된다.

- 한 경로의 우회를 제거해도 다른 low-level API가 completion을 기록한다.
- review, approval, evidence binding, knowledge commit 사이에 중간 상태가 노출된다.
- `CLOSE` 진입 후 부족한 proof를 추가할 수 없어 run이 복구 불가능해진다.
- SQLite authority를 추가해도 runtime context와 ontology가 JSONL을 읽어 이중 authority가 유지된다.
- Git commit/push 실패가 finalization authority와 혼합된다.
- 함수 단위 mock test는 통과하지만 aggregate invariant는 깨진다.

## 2. 선택 설계

### 2.1 Aggregate Root

`FinalizationAggregate`가 다음 상태를 한 단위로 소유한다.

```text
Run
Static Obligations
Dynamic Obligations
Knowledge Candidates
Candidate Evidence Bindings
Candidate Approvals
Knowledge Review Decision
Completion Decision
Knowledge Transaction
Finalization Authority Receipt
Git Closeout Job
```

외부 caller는 aggregate 내부 row를 직접 mutation하지 않는다.

### 2.2 Public Application API

```js
prepareFinalization(runId, input)
approveKnowledgeCandidate(runId, candidateId, approval)
recordProof(runId, proof)
finalizeRun(runId, options)
retryGitCloseout(runId)
getFinalizationStatus(runId)
```

금지 public API:

```text
persistCompletionDecision(runId, callerEvaluation)
recordCompletionDecision(...)
commitKnowledgeTransaction(...)
recordKnowledgeCommitReceipt(...)
recordCandidateEvidenceBinding(...)
transition(runId, CLOSE)
commitProjectKnowledge(...callerCandidates)
```

저수준 repository 함수는 `scripts/kernel/persistence/**` 내부에서만 사용한다.

## 3. Prepare / Commit 분리

### 3.1 Prepare

Prepare는 재실행 가능하며 authority write를 수행하지 않는다.

```text
PROVE
→ observation materialization
→ candidate observed row
→ evidence binding validation
→ ontology evaluation
→ approval requirement
→ dynamic proof obligation
→ readiness report
```

Prepare 결과:

```json
{
  "status": "ready | blocked",
  "blockers": [],
  "candidateIds": [],
  "requiredApprovalIds": [],
  "requiredObligationIds": []
}
```

Blocked 결과에서는 run state와 run status를 변경하지 않는다.

### 3.2 Atomic Authority Commit

`finalizeRun()`은 prepare status가 ready인 경우에만 다음 transaction을 실행한다.

```text
BEGIN IMMEDIATE
1. run과 mutation revision 재조회
2. candidate, binding, approval, obligation 재조회
3. readiness 재계산
4. knowledge revision expected value 검증
5. PROVE → CLOSE 전이
6. completion decision 생성 및 저장
7. canonical knowledge records 생성 및 저장
8. revision CAS
9. knowledge transaction 및 receipt 저장
10. finalization authority receipt 저장
11. run completed 갱신
COMMIT
```

어느 단계든 실패하면 모든 authority mutation을 rollback한다.

## 4. Candidate Lifecycle

```text
observed
→ needs_approval | pending_verification | rejected | verified
→ committed
```

### 4.1 Materialization 순서

1. Kernel이 candidate ID를 생성한다.
2. `knowledge_candidates(status=observed)`를 먼저 저장한다.
3. 명시적 evidence digest를 verification row와 대조한다.
4. 유효한 binding만 `candidate_evidence_bindings`에 저장한다.
5. ontology rule을 평가한다.
6. candidate status를 갱신한다.
7. aggregate review receipt를 생성한다.

전역 `lastVerification` 또는 `evidencePack`은 사용하지 않는다.

### 4.2 Approval

Approval은 observation과 같은 요청에서 받을 수 없다.

```text
prepare → needs_approval 반환
approveKnowledgeCandidate → 기존 candidate 검증 후 approval 저장
prepare → approval 반영
```

Approval precondition:

- candidate 존재
- run/project 일치
- candidate status `needs_approval`
- 중복 approval 없음
- approver와 receipt 비어 있지 않음

### 4.3 Dynamic Obligation

Ontology `always` 또는 `invariant`는 `run_obligations` row를 생성한다. `recordProof()`가 같은 obligation ID로 current mutation revision에 대한 valid passed verification을 기록한 경우에만 passed로 갱신한다.

## 5. Canonical Knowledge Record

Candidate JSON을 knowledge record로 직접 저장하지 않는다.

```js
materializeCanonicalKnowledgeRecord(candidate, bindings, revision)
```

필수 결과:

```json
{
  "id": "record-id",
  "candidateId": "candidate-id",
  "projectId": "project-id",
  "type": "architecture_decision",
  "status": "committed",
  "trustTier": "verified",
  "statement": "...",
  "scope": [],
  "evidence": {
    "bindings": []
  },
  "revision": 3
}
```

`knowledge_records.record_type`, `status`, `trust_tier`, `revision` column과 `record_json`은 동일 의미를 가져야 한다.

## 6. SQLite Runtime Authority

정상 runtime에서 다음 읽기는 SQLite만 사용한다.

- project knowledge revision
- stage context
- ontology constraints
- architecture/domain/tacit knowledge
- candidate/review status
- completion/finalization status

JSONL fallback은 migration, audit, repair command에서만 허용한다.

## 7. Derived Projection

Projection은 authority transaction 이후 실행하는 derived side effect다.

```text
SQLite committed records
→ type partition
→ atomic JSONL replacement
→ revision.json = SQLite revision
→ projection receipt
```

Projection 실패는 authority transaction을 rollback하지 않는다. 파일을 모두 삭제한 뒤 `rebuildKnowledgeProjection(projectId)`로 완전 복구 가능해야 한다.

## 8. Git Closeout Outbox

Git은 SQLite transaction에 포함할 수 없는 외부 delivery다.

Authority transaction 내부에서 Git closeout 요청이 있으면 `git_closeout_jobs(status=pending)`를 생성한다. Transaction commit 후 worker/service가 실행한다.

```text
pending
→ commit_created
→ push_failed | parity_failed | completed
```

Postconditions:

- `HEAD == receipt.commitSha`
- index clean
- selected path clean
- unselected working changes preserved
- retry는 동일 commit SHA만 push
- push command는 `git push origin <sha>:refs/heads/<branch>`

## 9. Module Boundary

```text
scripts/kernel/finalization/
  coordinator.mjs
  prepare.mjs
  readiness.mjs
  authority-commit.mjs
  model.mjs

scripts/kernel/knowledge/
  candidate-materializer.mjs
  evidence-binder.mjs
  ontology-gate.mjs
  canonical-record.mjs
  projection.mjs

scripts/kernel/persistence/
  transaction.mjs
  run-repository.mjs
  knowledge-repository.mjs
  finalization-repository.mjs

scripts/kernel/git/
  closeout-outbox.mjs
  closeout-worker.mjs
```

`state-store.mjs`는 migration 기간의 compatibility facade로 축소한 뒤 Phase 05에서 authority mutation method를 제거한다.

## 10. Invariants

1. `finalizeRun()` 외 public call 후 completion decision row 증가는 0이다.
2. blocked prepare 후 run은 `PROVE`에 남는다.
3. 모든 committed knowledge record는 existing candidate와 valid binding을 가진다.
4. completion decision, knowledge receipt, finalization authority receipt는 모두 존재하거나 모두 존재하지 않는다.
5. runtime lifecycle은 JSONL 파일이 없어도 동작한다.
6. projection rebuild 결과는 SQLite committed set과 동일하다.
7. Git closeout 성공 후 HEAD/index/selected path postcondition이 모두 참이다.
8. Git retry는 commit count를 증가시키지 않는다.
