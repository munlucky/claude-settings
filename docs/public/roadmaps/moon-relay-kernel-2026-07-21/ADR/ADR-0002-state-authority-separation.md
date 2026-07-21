# ADR-0002 State Authority Separation

## Status

Accepted

## Context

Kernel은 사람이 읽을 수 있는 계획·상태 파일과 원자적 실행 상태를 모두 필요로 한다. 파일과 SQLite가 동일한 상태를 양방향 수정하면 split-brain이 발생할 수 있다. 반대로 SQLite를 폐지하면 lease, attempt, 상태 전이, completion decision의 원자성을 파일 락으로 다시 구현해야 한다.

## Decision

- 파일은 실행 의도와 사람이 승인한 정의를 소유한다.
  - Task Contract
  - glossary와 ADR
  - slice manifest와 DAG
  - 승인된 waiver
- SQLite는 실행 사실과 권한을 소유한다.
  - run/goal
  - lease/executor
  - attempt/retry
  - transition
  - verification receipt
  - evidence lineage
  - completion authority
- `STATE.md`, `run-status.json`, `QA_REPORT.json`은 SQLite에서 생성되는 단방향 projection이다.
- projection은 runtime revision과 hash를 포함하고 DB 역갱신 입력으로 사용하지 않는다.
- Relay DB와 Kernel DB는 공유하거나 자동 마이그레이션하지 않는다.
- durable knowledge import는 별도 명시적·read-only 변환 절차로 제한한다.

## Consequences

- 사람이 파일만 읽어도 상태를 파악할 수 있다.
- completion authority와 lease 원자성을 유지한다.
- projection tampering과 stale revision 검사가 필요하다.
- backup/recovery 절차가 DB와 evidence pack을 함께 다뤄야 한다.

## Rejected Alternatives

- SQLite를 폐지하고 Markdown/JSON 파일만 실행 권한으로 사용한다.
- 파일과 DB를 양방향 동기화한다.
- Relay runtime-state를 Kernel DB로 자동 복사한다.
- phase status 파일 존재만으로 완료를 판정한다.
