# Phase 05 - Git Outbox, Invariant Tests, Legacy Removal and Promotion

## Objective

Git closeout을 finalization authority와 분리된 outbox delivery로 구현하고, 실제 SQLite/Git integration invariants를 통과한 뒤 legacy authority API를 삭제하고 package/full regression으로 승격 여부를 판정한다.

## Phase Execution Metadata

```yaml
phaseExecutionMetadata:
  phaseId: PH-05
  dependsOn: [PH-04]
  executionMode: sequential
  entryState: sqlite_runtime_authority_ready
  exitState: promotion_candidate_ready
  owners:
    primary: git-delivery-and-closeout
    verification: independent-final-review
  verificationSignals:
    - VS-git-outbox-state-machine
    - VS-explicit-sha-retry
    - VS-head-index-worktree-postconditions
    - VS-real-invariant-suite
    - VS-legacy-surface-zero
    - VS-package-full-regression
```

## Surface Classification

- `source_only`: Git outbox service, invariant tests, legacy removal.
- `package_runtime_payload`: CLI and package test inventory; controlled after targeted tests.
- `external_deployment_or_service`: production Git remote interaction; tests use disposable local bare remote.
- `data_or_state_migration`: additive `git_closeout_jobs`/receipt status migration.
- `installed_profile_or_account_root`: out of scope, live mutation forbidden.

## Owned Paths

```text
scripts/kernel/git/closeout-outbox.mjs
scripts/kernel/git/closeout-worker.mjs
scripts/kernel/git/staging-policy.mjs
scripts/kernel/git/remote-parity.mjs
scripts/kernel/finalization/coordinator.mjs
scripts/kernel/persistence/finalization-repository.mjs
scripts/kernel/state-store.mjs
scripts/kernel/control-plane.mjs
bin/moon-relay-kernel.mjs
package.json
package/harness-surface-budget.json
tests/kernel-git-closeout-outbox.test.mjs
tests/kernel-git-index-postcondition.test.mjs
tests/kernel-finalization-invariants.test.mjs
tests/kernel-finalization-public-surface.test.mjs
tests/kernel-finalization-install-package-e2e.test.mjs
```

## Read-Only Paths

```text
package/package-contract.yaml
scripts/lib/git-safe.mjs
scripts/harness-surface-report.mjs
bin/moon-harness-switcher.mjs
```

## Write-Set Boundary

- 테스트는 disposable repository와 local bare remote만 사용한다.
- 현재 작업 branch 외 remote branch를 변경하지 않는다.
- live profile/account-root 설치는 수행하지 않는다.
- legacy API 삭제는 신규 aggregate invariant suite가 GREEN인 이후에만 수행한다.

## Work

1. Authority transaction에서 Git 요청이 있으면 `git_closeout_jobs(status=pending)`만 저장한다.
2. Transaction commit 후 outbox worker가 pending job을 실행한다.
3. 사전 staged 변경이 있으면 commit 전에 fail-closed한다.
4. Candidate paths를 repository containment, traversal, NUL, denylist, symlink ancestor, actual changed-path 기준으로 검증한다.
5. Selected path만 commit tree에 포함하고 unselected working changes를 보존한다.
6. Commit 생성과 branch ref CAS 성공 직후 `commit_created` receipt를 저장한다.
7. Actual index를 새 HEAD 기준으로 동기화하고 다음 postcondition을 확인한다.
   - `HEAD == commitSha`
   - cached diff 없음
   - selected path working diff 없음
   - unselected changes 보존
8. Push는 explicit SHA refspec을 사용한다.
9. Push/parity 실패 시 commit SHA와 retryable status를 저장한다.
10. Retry는 DB receipt의 SHA만 사용하며 commit count를 증가시키지 않는다.
11. Git delivery status와 finalization authority status를 분리한다.
12. 다음 invariant suite를 실제 resource로 구현한다.
    - two independent SQLite connections OCC
    - record-insert-after fault rollback
    - blocked prepare recoverability
    - two-step approval
    - dynamic obligation resume
    - projection deletion/rebuild
    - local bare remote push failure/retry
    - Git index/worktree postcondition
13. Mock-only blocker tests를 real integration tests로 교체한다.
14. Mapping-only typed persistence test를 persisted canonical record/context retrieval test로 교체한다.
15. Legacy completion/knowledge mutation facade와 dead imports를 제거한다.
16. CLI `finalize`, `finalization-status`, `git-closeout`를 신규 coordinator/outbox에 연결한다.
17. Package materialization과 installed package doctor lifecycle을 disposable output에서 검증한다.
18. 독립 final review가 blocking finding 0을 확인한 뒤 promotion candidate로 표시한다.

## Acceptance Criteria

- Git failure가 completion/knowledge authority rows를 rollback하거나 `partial authority`로 바꾸지 않는다.
- Push failure receipt에는 retry 가능한 commit SHA가 존재한다.
- Retry 전후 commit count가 동일하다.
- Git closeout 성공 후 HEAD/index/selected path postcondition이 모두 참이다.
- Unselected working changes가 byte-identical하게 유지된다.
- Symlink 또는 repo 외부 path가 commit되지 않는다.
- `finalizeRun()` 외 public completion writer가 없다.
- Legacy `persistCompletionDecision(callerEvaluation)`, caller candidate commit, JSONL runtime fallback이 없다.
- Blocker gate 중 mock-only/mapping-only 테스트가 0이다.
- Kernel/package/full regression 및 surface check가 통과한다.

## Spec-Test Obligations

- FAR-REQ-008, FAR-REQ-009, FAR-REQ-010
- FAR-SCN-009, FAR-SCN-013, FAR-SCN-014, FAR-SCN-015

## Verification

```bash
node --test tests/kernel-git-closeout-outbox.test.mjs tests/kernel-git-index-postcondition.test.mjs tests/kernel-finalization-invariants.test.mjs tests/kernel-finalization-public-surface.test.mjs tests/kernel-finalization-install-package-e2e.test.mjs
npm run test:kernel
npm run test:package
npm test
node scripts/harness-surface-report.mjs check
node scripts/spec-test-obligations.mjs validate --json
node bin/moon-relay-kernel.mjs package --output /tmp/moon-relay-kernel-finalization-package
node /tmp/moon-relay-kernel-finalization-package/bin/moon-relay-kernel.mjs doctor
```

## Evidence

```text
artifacts/kernel/finalization-refactor/phase-05/git-outbox-state-machine.json
artifacts/kernel/finalization-refactor/phase-05/git-retry-equivalence.json
artifacts/kernel/finalization-refactor/phase-05/git-index-postconditions.json
artifacts/kernel/finalization-refactor/phase-05/finalization-invariant-report.json
artifacts/kernel/finalization-refactor/phase-05/legacy-surface-inventory.json
artifacts/kernel/finalization-refactor/phase-05/package-doctor-report.json
artifacts/kernel/finalization-refactor/phase-05/full-regression-report.json
planning-loop/plan-quality-review-final.yaml
```

## Promotion Decision

```yaml
promotionDecision:
  candidateBranch: plan/kernel-project-knowledge-lifecycle
  targetBranch: main
  autoMerge: false
  required:
    - all phase checklists complete
    - blocking findings zero
    - all hard invariants pass
    - package/full regression pass
    - GitHub CI pass when workflow is available
  mergeAuthority: operator
```

## Risks and Rollback

- Git outbox worker 오류는 pending/retryable receipt를 유지하고 authority transaction에는 영향을 주지 않는다.
- Package CLI 연결 실패 시 source coordinator는 보존하고 CLI/package commit만 rollback한다.
- Promotion 이후 회귀가 발견되면 main에서 selective revert하고 runtime DB를 역마이그레이션하지 않는다. Additive schema는 reader compatibility를 유지한다.
