# ADR-0001: Finalization Aggregate를 유일한 Completion Authority로 사용

- Status: Accepted for implementation planning
- Date: 2026-07-23
- Decision Owner: finalization-architecture

## Context

Completion, knowledge review, knowledge commit, finalization receipt가 여러 public API와 모듈에 분산되어 동일 결함을 반복 수정하게 됐다. Caller-authored evaluation, candidate payload, low-level persistence method가 정상 lifecycle을 우회할 수 있다.

## Decision

`FinalizationAggregate`를 aggregate root로 두고 public mutation surface를 다음으로 제한한다.

```text
prepareFinalization
approveKnowledgeCandidate
recordProof
finalizeRun
retryGitCloseout
```

Completion decision은 `finalizeRun()`이 호출하는 atomic authority transaction 내부에서 직접 계산한다. Caller evaluation을 받지 않는다. `CLOSE` 전이도 같은 transaction 내부에서 readiness 재검증 후 수행한다.

## Consequences

- blocked prepare는 `PROVE`에 남아 복구 가능하다.
- completion/knowledge/finalization의 중간 authority 상태가 제거된다.
- state store 저수준 mutation method는 repository-private로 이동한다.
- 기존 public API와 테스트의 대규모 변경이 필요하다.

## Rejected Alternatives

1. 기존 `finalizeRun()`에 guard만 추가: 다른 low-level API 우회가 계속 남는다.
2. Completion과 knowledge commit을 별도 transaction으로 유지: crash window와 partial authority가 남는다.
3. `CLOSE` 후 blocked 상태에서 PROVE로 역전이: terminal state 의미를 약화시키며 authority mutation을 되돌리는 복잡성이 증가한다.

## Verification Signals

- `finalizeRun()` 외 public call 후 completion row 증가 0
- blocked readiness 후 run state `PROVE`
- completion, knowledge receipt, finalization authority receipt all-or-nothing
