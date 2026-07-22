# ADR-0001 Dual-Track Product Isolation

## Status

Accepted

## Context

Moonshot Relay는 안정 트랙으로 계속 사용되어야 하며, Moon Relay Kernel은 동일 계정과 동일 저장소에서 실험·dogfood가 가능해야 한다. 스킬만 나란히 설치하면 시스템 지침, 훅, 상태, completion authority가 섞일 수 있다. Codex 앱은 CLI 프로필 전환보다 프로젝트/worktree 선택이 실제 격리 경계가 된다.

## Decision

- `main`은 Relay 안정 트랙으로 유지한다.
- `kernel/moon-relay-kernel`은 Kernel 실험 트랙으로 사용한다.
- 초기에는 루트 package를 즉시 rename하지 않고 Kernel 전용 product manifest, CLI, package payload, profile generator를 병렬 추가한다.
- Relay는 `~/.moonshot-relay`, Kernel은 `~/.moon-relay-kernel`을 사용한다.
- 프로젝트는 `.moon-relay/track.yaml`로 활성 트랙을 선언한다.
- Codex 앱에서는 Relay/Kernel base worktree를 각각 앱 프로젝트로 등록하고 해당 트랙의 `.agents/skills`, `.codex`, `AGENTS.override.md`만 노출한다.
- 잘못된 트랙에서 Kernel entrypoint를 호출하면 실행을 거부한다.

## Consequences

- 같은 계정에서 두 하네스를 A/B 비교할 수 있다.
- package/profile/state 충돌을 기계적으로 검사해야 한다.
- main 보안 수정은 선택적 sync가 필요하다.
- 장기 branch drift 관리 비용이 발생한다.

## Rejected Alternatives

- Relay 세션에서 Kernel 스킬 호출만으로 하네스를 전환한다.
- Relay와 Kernel 스킬 전체를 전역 skill root에 함께 설치한다.
- 초기 단계에서 root package와 저장소를 즉시 rename한다.
- Relay와 Kernel이 하나의 runtime home 또는 DB를 공유한다.
