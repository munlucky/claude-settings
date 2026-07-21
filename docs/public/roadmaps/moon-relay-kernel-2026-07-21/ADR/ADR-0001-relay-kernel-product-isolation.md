# ADR-0001 Relay and Kernel Product Isolation

## Status

Accepted

## Context

Relay와 Kernel은 같은 계정과 저장소에서 개발되지만 서로 다른 스킬·상태·프로필·완료 권한을 가져야 한다. 스킬 하나만 호출해 세션 중 하네스를 전환하면 이미 로드된 지침·훅·상태가 섞일 수 있다.

## Decision

- 제품 ID는 `moon-relay-kernel`, 개발 브랜치는 `kernel/moon-relay-kernel`로 한다.
- Relay runtime home은 `~/.moonshot-relay`, Kernel은 `~/.moon-relay-kernel`을 사용한다.
- runtime-state, run/goal/lease, cache, logs, knowledge revision, profile manifest, skill lock을 공유하지 않는다.
- 프로젝트 마커 `.moon-relay/track.yaml`과 provider profile marker가 active harness를 결정한다.
- wrong-harness entrypoint 호출은 mutation 없이 거부한다.
- Codex 앱은 `[Relay]`와 `[Kernel]` base worktree를 별도 프로젝트로 등록한다.
- 초기에는 source/package를 동일 저장소 안에 병렬 구현하고, 안정화 후 별도 저장소 분리를 평가한다.

## Consequences

- 동시 설치와 A/B 테스트가 가능하다.
- package/profile 테스트 범위가 증가한다.
- 공통 source utility는 재사용할 수 있지만 runtime directory는 공유하지 않는다.

## Rejected Alternatives

- Relay 세션에서 Kernel 스킬 호출만으로 하네스 전환.
- 전역 skill directory에 두 제품 전체 카탈로그 동시 설치.
- Kernel 안정화 전에 Relay root package를 즉시 rename.