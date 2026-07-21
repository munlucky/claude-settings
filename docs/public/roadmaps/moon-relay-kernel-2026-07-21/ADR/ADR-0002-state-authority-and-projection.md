# ADR-0002 State Authority and One-Way Projection

## Status

Accepted

## Context

사람이 읽는 계획·상태 파일과 SQLite 실행 상태를 모두 mutable authority로 사용하면 split-brain이 발생한다. 반대로 SQLite를 제거하면 lease, attempt, transition, completion의 원자성과 복구 책임을 파일 락으로 다시 구현해야 한다.

## Decision

- Task Contract, slice manifest, glossary, ADR은 실행 의도를 소유한다.
- Kernel SQLite는 run, goal, lease, attempt, transition, verification, completion decision을 소유한다.
- `STATE.md`, `run-status.json`, `QA_REPORT.json`은 DB revision과 hash에서 생성되는 read-only projection이다.
- projection은 실행 입력이 아니며 수동 변경을 DB에 역반영하지 않는다.
- projection mismatch는 stale/tamper 상태로 보고한다.
- Kernel은 Relay DB를 자동 탐색·공유·마이그레이션하지 않는다.
- fresh evidence와 runtime decision 없이는 완료를 인정하지 않는다.

## Consequences

- 실행 권한의 단일성이 유지된다.
- 사용자는 파일만으로 상태를 확인할 수 있다.
- projection generator와 recovery test가 추가로 필요하다.

## Rejected Alternatives

- SQLite 전면 폐지와 Markdown 단독 completion authority.
- 파일과 DB의 양방향 동기화.
- Relay DB를 Kernel 최초 실행 시 자동 migration.