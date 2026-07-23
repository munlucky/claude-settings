# Phase 02 - Finalization Aggregate Prepare

## Objective

재실행 가능한 `prepareFinalization()` 경로를 구현하여 candidate, evidence binding, approval, ontology obligation, review readiness를 하나의 aggregate로 계산한다. Blocked 상태에서는 run을 `PROVE`에 유지한다.

## Phase Execution Metadata

```yaml
phaseExecutionMetadata:
  phaseId: PH-02
  dependsOn: [PH-01]
  executionMode: sequential
  entryState: baseline_frozen
  exitState: aggregate_prepare_ready
  owners:
    primary: finalization-domain
    verification: kernel-integration-tests
  verificationSignals:
    - VS-prepare-reentrant
    - VS-blocked-run-remains-prove
    - VS-candidate-binding-order
    - VS-two-step-approval
    - VS-dynamic-obligation-resume
```

## Surface Classification

- `source_only`: finalization domain/application modules and tests.
- `data_or_state_migration`: additive candidate/review/binding/obligation schema only; disposable runtimeHome first.

## Owned Paths

```text
scripts/kernel/finalization/model.mjs
scripts/kernel/finalization/prepare.mjs
scripts/kernel/finalization/readiness.mjs
scripts/kernel/knowledge/candidate-materializer.mjs
scripts/kernel/knowledge/evidence-binder.mjs
scripts/kernel/knowledge/ontology-gate.mjs
scripts/kernel/persistence/knowledge-repository.mjs
scripts/kernel/persistence/finalization-repository.mjs
scripts/kernel/state-store.mjs
tests/kernel-finalization-prepare.test.mjs
tests/kernel-finalization-approval-lifecycle.test.mjs
tests/kernel-finalization-dynamic-obligation.test.mjs
tests/kernel-finalization-evidence-binding.test.mjs
```

## Read-Only Paths

```text
scripts/kernel/control-plane.mjs
scripts/kernel/knowledge/ontology-evaluate.mjs
schemas/verification.contract.yaml
package.json
```

## Write-Set Boundary

- Completion decision, run `CLOSE`, knowledge revision, knowledge records, Git은 수정하지 않는다.
- Existing `finalizeRun()` production routing은 Phase 03 전까지 유지하되 신규 prepare path를 직접 호출하지 않는다.
- candidate/evidence/approval/obligation schema는 additive migration만 허용한다.

## Work

1. `FinalizationAggregateSnapshot` typed model을 정의한다.
2. Observation 입력을 먼저 `knowledge_candidates(status=observed)`로 materialize한다.
3. Kernel이 candidate ID를 생성하며 caller-authored ID는 import/migration 모드 외 거부한다.
4. Candidate별 explicit evidence digest를 verification row와 대조한다.
5. 다음 조건을 모두 만족한 binding만 저장한다.
   - same run
   - passed
   - exitCode 0
   - source identity 일치
   - current mutation revision
6. 전역 `lastVerification` 및 `evidencePack` 경로를 제거한다.
7. Ontology `never`, `ask_first`, `always/invariant`를 candidate별로 평가한다.
8. `ask_first`는 candidate를 `needs_approval`로 저장하고 prepare를 blocked로 반환한다.
9. Approval을 별도 `approveKnowledgeCandidate()` API로만 등록한다.
10. `always/invariant`는 stable obligation ID를 만들고 `run_obligations(status=required)`에 저장한다.
11. Proof가 동일 obligation을 충족하면 다음 prepare에서 candidate를 verified로 승격한다.
12. 모든 candidate 상태와 aggregate review receipt를 transactionally 저장한다.
13. Blocked prepare에서는 run state/status/completion rows가 변하지 않는지 검증한다.

## API Contract

```js
prepareFinalization(runId, {
  observations = [],
  expectedMutationRevision = null
})

approveKnowledgeCandidate(runId, candidateId, {
  approvedBy,
  approvalReceipt
})
```

Prepare result:

```json
{
  "status": "ready | blocked",
  "reviewStatus": "no_candidates | passed | needs_approval | pending_verification | failed",
  "blockers": [],
  "candidateIds": [],
  "reviewDigest": "sha256:..."
}
```

## Acceptance Criteria

- Evidence binding row는 candidate FK 이후에만 생성된다.
- Candidate마다 최소 하나의 current verification binding이 없으면 verified가 될 수 없다.
- 신규 observation과 approval을 동일 호출로 처리할 수 없다.
- Existing `needs_approval` candidate만 승인할 수 있다.
- Dynamic obligation 미충족 시 prepare는 blocked이며 run은 `PROVE`에 남는다.
- Proof 기록 후 같은 candidate를 재전송하지 않아도 prepare가 ready로 전환된다.
- Prepare 호출만으로 completion, knowledge transaction, Git receipt row가 생성되지 않는다.

## Spec-Test Obligations

- FAR-REQ-002, FAR-REQ-003
- FAR-SCN-002, FAR-SCN-003, FAR-SCN-004, FAR-SCN-005

## Verification

```bash
node --test tests/kernel-finalization-prepare.test.mjs tests/kernel-finalization-approval-lifecycle.test.mjs tests/kernel-finalization-dynamic-obligation.test.mjs tests/kernel-finalization-evidence-binding.test.mjs
npm run test:kernel
```

## Evidence

```text
artifacts/kernel/finalization-refactor/phase-02/prepare-state-matrix.json
artifacts/kernel/finalization-refactor/phase-02/approval-lifecycle.json
artifacts/kernel/finalization-refactor/phase-02/evidence-binding-integrity.json
artifacts/kernel/finalization-refactor/phase-02/dynamic-obligation-resume.json
```

## Risks and Rollback

- 신규 schema migration 실패 시 additive tables/indexes만 rollback하고 기존 run tables는 변경하지 않는다.
- prepare path가 기존 finalize와 동시에 authority를 쓰지 않도록 feature flag가 아니라 routing 미연결 상태로 격리한다.
