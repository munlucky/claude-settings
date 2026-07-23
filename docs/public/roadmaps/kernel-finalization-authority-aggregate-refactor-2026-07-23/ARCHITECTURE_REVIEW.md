# Kernel Finalization Authority Aggregate Architecture Review

## Review Status

```yaml
architectureReview:
  status: ready_for_phase_01_preflight
  blocking: true
  blockingReason: independent blocker-confirmation review is required in Phase 01 before source implementation
  reviewedBaseline: ad8fa53488dbd79766b993c2113454eb1379b7e8
  reviewedPlanRoot: docs/public/roadmaps/kernel-finalization-authority-aggregate-refactor-2026-07-23
```

## Review Scope

- Finalization Aggregate boundary
- Prepare/readiness recoverability
- Completion and knowledge atomic transaction
- Candidate/evidence/approval/obligation lifecycle
- SQLite-only runtime knowledge authority
- Typed projection and repair
- Git outbox exact-SHA delivery and retry
- Real integration invariant strategy
- Legacy authority API removal

## Findings

### Accepted design decisions

1. `FinalizationAggregate`를 sole completion authority로 사용한다.
2. Prepare와 commit을 분리하고 blocked prepare에서는 run을 `PROVE`에 유지한다.
3. Completion, canonical knowledge, revision, receipts를 한 SQLite transaction으로 확정한다.
4. Candidate를 evidence binding보다 먼저 영속화한다.
5. Approval은 별도 public command로만 수행한다.
6. Runtime knowledge read는 SQLite만 사용한다.
7. JSONL은 repair 가능한 projection으로 제한한다.
8. Git은 outbox delivery이며 authority transaction과 분리한다.
9. Blocker tests는 mock/mapping/receipt-only가 아니라 actual resource invariant를 사용한다.

### Blocking preflight finding

- `skills/moonshot-plan-writer/references/independent-review-loop.md`가 요구하는 독립 review isolation을 현재 문서 작성 세션에서 확보하지 못했다. Phase 01에서 별도 reviewer session 또는 operator가 지정한 independent reviewer가 blocker-confirmation pass를 수행해야 한다.

### Non-blocking implementation cautions

- `state-store.mjs`를 즉시 삭제하지 말고 persistence facade로 축소한 뒤 Phase 05에서 legacy mutation exports를 제거한다.
- Additive SQLite schema는 기존 DB reader compatibility를 유지해야 한다.
- Legacy JSONL-only data import는 자동 실행하지 않는다.
- Git outbox 테스트는 network GitHub remote가 아니라 local bare remote를 사용한다.
- Finalization authority 완료와 Git delivery 완료를 같은 status로 합치지 않는다.

## Rejected Alternatives

| Alternative | Rejection Reason |
|---|---|
| 기존 blocker 7건만 개별 수정 | 동일 authority 경계가 남아 다음 review에서 다른 우회가 재발함 |
| Completion 후 knowledge commit 별도 유지 | crash window와 partial authority가 남음 |
| `CLOSE`에서 `PROVE`로 역전이 추가 | terminal state 의미와 mutation lineage가 복잡해짐 |
| SQLite 우선 + JSONL fallback | 장애 시 stale projection이 runtime authority로 복귀함 |
| Git closeout을 finalization partial 상태로 표현 | authority와 external delivery를 혼합함 |
| mock store로 OCC/rollback 검증 | 실제 WAL/locking/FK/transaction behavior를 검증하지 못함 |

## Readiness Decision

- Plan package artifact completeness: pass
- Architecture decision completeness: pass
- Traceability: pass
- Spec-Test obligations: pass
- Independent review isolation: pending
- Implementation readiness: `runnable_after_phase_01`

## Required Re-Review

Phase 01 종료 시 다음 질문만 blocker-confirmation 한다.

1. Public authority writer inventory가 완전한가?
2. Aggregate transaction boundary가 현재 call graph의 모든 우회를 닫는가?
3. Phase 02~05 owned paths와 write sets가 병행 작업과 충돌하지 않는가?
4. Real integration tests가 모든 hard invariant를 직접 측정하는가?

Non-blocking 개선 의견은 backlog로 이동하고 계획 iteration을 무한 반복하지 않는다.
