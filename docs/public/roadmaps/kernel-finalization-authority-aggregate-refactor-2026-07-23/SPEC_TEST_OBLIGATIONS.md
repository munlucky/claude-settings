# Kernel Finalization Authority Aggregate Spec-Test Obligations

모든 `FAR-REQ-*`와 UAT-critical `FAR-SCN-*`는 아래 obligation을 만족해야 한다. 기존 결함 재현은 `characterization_first`, 신규 authority behavior는 `tdd_red_green`, Git/package adoption은 `evidence_mandatory`를 사용한다.

## Requirement Obligations

| ID | Interface | Depth | Environment | Verification Mode | Required Command / Check | Evidence Path | Owner Phase |
|---|---|---|---|---|---|---|---|
| FAR-REQ-001 | finalization public API | broad_stack | local SQLite | characterization_first → tdd_red_green | public authority inventory + completion row audit | `artifacts/kernel/finalization-refactor/phase-03/public-authority-surface.json` | 01,03,05 |
| FAR-REQ-002 | finalization readiness | integration | disposable runtimeHome | tdd_red_green | blocked prepare/retry state matrix | `artifacts/kernel/finalization-refactor/phase-02/prepare-state-matrix.json` | 01,02,03 |
| FAR-REQ-003 | candidate aggregate | integration | disposable runtimeHome | tdd_red_green | approval, binding, obligation lifecycle suites | `artifacts/kernel/finalization-refactor/phase-02/evidence-binding-integrity.json` | 02 |
| FAR-REQ-004 | SQLite authority transaction | broad_stack | two SQLite connections | tdd_red_green | atomicity, OCC, fault rollback suites | `artifacts/kernel/finalization-refactor/phase-03/authority-atomicity.json` | 03 |
| FAR-REQ-005 | canonical typed record | integration | SQLite + context loader | tdd_red_green | persisted canonical record and retrieval matrix | `artifacts/kernel/finalization-refactor/phase-03/canonical-record-matrix.json` | 03,04 |
| FAR-REQ-006 | runtime knowledge reader | broad_stack | projection files absent | characterization_first → tdd_red_green | start/context/ontology SQLite-only suite | `artifacts/kernel/finalization-refactor/phase-04/sqlite-read-authority.json` | 04 |
| FAR-REQ-007 | derived projection | integration | disposable runtimeHome | tdd_red_green | delete/rebuild/failure recovery suite | `artifacts/kernel/finalization-refactor/phase-04/projection-equivalence.json` | 04 |
| FAR-REQ-008 | Git outbox delivery | broad_stack | temp repo + local bare remote | evidence_mandatory | explicit SHA push, failure, retry, parity | `artifacts/kernel/finalization-refactor/phase-05/git-outbox-state-machine.json` | 05 |
| FAR-REQ-009 | invariant verification | broad_stack | real SQLite/Git resources | evidence_mandatory | final invariant suite; mock-only gate count 0 | `artifacts/kernel/finalization-refactor/phase-05/finalization-invariant-report.json` | 01-05 |
| FAR-REQ-010 | legacy surface removal | component + integration | source checkout | tdd_red_green | exported symbol/import/caller audit | `artifacts/kernel/finalization-refactor/phase-05/legacy-surface-inventory.json` | 03,05 |

## UAT-Critical Scenario Obligations

| Scenario | Highest Public Seam / Seam Rationale | Required Command or Check | Evidence Path | Expected Result |
|---|---|---|---|---|
| FAR-SCN-001 completion authority 우회 | Control Plane public API가 highest practical seam | public method 호출 후 completion row count audit | `phase-03/public-authority-surface.json` | `finalizeRun` 외 증가 0 |
| FAR-SCN-002 early finalize | `prepareFinalization/finalizeRun` orchestration seam | proof 부족 상태 prepare/finalize/retry | `phase-02/prepare-state-matrix.json` | blocked, run `PROVE`, proof 추가 가능 |
| FAR-SCN-003 explicit evidence binding | candidate application seam + real FK | foreign/stale/current evidence fixtures | `phase-02/evidence-binding-integrity.json` | current same-run binding만 저장 |
| FAR-SCN-004 ask-first approval | public prepare/approve/prepare seam | two-step approval lifecycle | `phase-02/approval-lifecycle.json` | 신규 candidate와 동시 승인 불가 |
| FAR-SCN-005 invariant obligation | public proof and prepare seam | required → proof → passed → ready | `phase-02/dynamic-obligation-resume.json` | candidate verified |
| FAR-SCN-006 change authority commit | public finalize seam + SQLite inspection | atomic transaction test | `phase-03/authority-atomicity.json` | authority rows all present |
| FAR-SCN-007 no-change commit | public finalize seam | zero-candidate finalization | `phase-03/authority-atomicity.json` | revision 유지, tx/receipt 존재 |
| FAR-SCN-008 concurrent finalization | two independent DB handles | concurrent authority commits | `phase-03/concurrency-results.json` | 한 건만 성공 |
| FAR-SCN-009 injected crash | transaction seam | fail after record insert before revision | `phase-03/fault-rollback.json` | authority mutation 전부 rollback |
| FAR-SCN-010 typed retrieval | public stage context seam | commit all types then build contexts | `phase-04/typed-context-matrix.json` | exact category와 stage policy |
| FAR-SCN-011 deleted projections | public lifecycle + repair seam | projection root 삭제 후 run/context/rebuild | `phase-04/projection-equivalence.json` | runtime 정상, rebuild parity |
| FAR-SCN-012 projection write failure | public finalize then next run seam | injected projection failure | `phase-04/projection-failure-recovery.json` | authority committed, 다음 run 정상 |
| FAR-SCN-013 push failure | Git outbox worker seam | invalid remote or rejected bare remote | `phase-05/git-outbox-state-machine.json` | SHA 보존, retryable status |
| FAR-SCN-014 retry | public `git-closeout` retry seam | remote 복구 후 retry | `phase-05/git-retry-equivalence.json` | 같은 SHA, duplicate commit 0 |
| FAR-SCN-015 Git postconditions | actual repository state seam | HEAD/index/selected/unselected checks | `phase-05/git-index-postconditions.json` | 모든 postcondition 통과 |

## Seam Rationale

- Completion authority는 helper 함수가 아니라 Control Plane public lifecycle과 SQLite row set을 함께 검사하는 seam이 가장 높다.
- Transaction atomicity는 mock store가 아니라 두 실제 SQLite connection과 fault injection을 사용하는 seam에서만 검증한다.
- Knowledge persistence는 type mapper 단위가 아니라 candidate → canonical DB record → context retrieval 전체 seam에서 검증한다.
- Projection은 writer 함수가 아니라 projection root 삭제 후 rebuild equivalence seam에서 검증한다.
- Git closeout은 helper 반환값이 아니라 실제 temp repository, local bare remote, HEAD/index/worktree 상태가 최종 seam이다.

## Validator

각 Phase가 기계 판독 가능한 obligation rows/evidence를 생성하고 다음 검증을 통과해야 한다.

```bash
node scripts/spec-test-obligations.mjs validate --json
```
