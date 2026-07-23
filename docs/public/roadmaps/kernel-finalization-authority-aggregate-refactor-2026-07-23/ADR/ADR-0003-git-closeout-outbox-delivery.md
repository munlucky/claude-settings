# ADR-0003: Git Closeout을 Authority Transaction 밖의 Outbox Delivery로 구현

- Status: Accepted for implementation planning
- Date: 2026-07-23
- Decision Owner: git-delivery-and-closeout

## Context

Git commit/push는 SQLite transaction에 포함할 수 없는 외부 side effect다. 기존 orchestration은 Git 실패를 finalization partial 상태와 혼합하고, branch ref 이동 후 실제 index postcondition을 충분히 보장하지 못했다.

## Decision

Finalization authority transaction은 Git 요청이 있을 때 `git_closeout_jobs(status=pending)`만 저장한다. Transaction commit 이후 outbox worker가 commit, index synchronization, explicit SHA push, parity verification을 수행한다.

State machine:

```text
pending
→ commit_created
→ push_failed | parity_failed | completed
```

Retry는 DB receipt의 commit SHA만 사용하며 새 commit을 생성하지 않는다.

## Required Postconditions

- `HEAD == receipt.commitSha`
- cached diff 없음
- selected path working diff 없음
- unselected working changes 보존
- pre-existing staged changes가 있으면 commit 전 차단
- actual changed path, repository containment, symlink ancestor 검증

## Consequences

- Git 실패가 completion/knowledge authority를 취소하지 않는다.
- Git delivery status를 별도로 관찰하고 재시도할 수 있다.
- DB와 Git 사이에는 eventual delivery 상태가 존재한다.
- Outbox worker와 retry integration test가 필요하다.

## Rejected Alternatives

1. Git 작업을 finalization transaction처럼 취급: 외부 side effect이므로 atomic rollback이 불가능하다.
2. Push 실패 시 새 commit 생성: duplicate commit과 branch divergence를 유발한다.
3. Temporary index만 사용하고 real index를 갱신하지 않음: 새 HEAD와 index 기준이 불일치한다.

## Verification Signals

- push failure receipt에 commit SHA 존재
- retry 전후 commit count 동일
- local bare remote parity matched
- 성공 후 HEAD/index/selected/unselected path postcondition 통과
