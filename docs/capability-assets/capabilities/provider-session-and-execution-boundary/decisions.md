# Capability Decisions: Provider session and execution boundary

- **Capability ID**: `provider-session-and-execution-boundary`
- **Disposition**: `retain`
- **Subcapabilities Count**: 3

## Rationale
현재 Kernel의 provider-independent core와 Host-owned execution을 연결하는 HOST capability다.

## Subcapabilities Allocation
- **Host session binding** (`host-session-binding`): `HOST` — Host/Provider 세션 식별 및 런타임 연결
  - Implementations: 3 files bound
  - Proofs: host-loop, multi-provider-session
- **Execution capsule transport** (`execution-capsule-transport`): `HOST` — 실행 캡슐 격리 및 transport 경계 보장
  - Implementations: 4 files bound
  - Proofs: execution-capsule
- **Step worktree isolation** (`step-worktree-isolation`): `HOST` — 스텝 단위 워크트리 생성 및 격리
  - Implementations: 2 files bound
  - Proofs: host-loop

## Follow-up Directives
- 새 transport는 local contract proof와 live host proof를 분리해 catalog에 표시한다.
