# Capability Decisions: Control plane state authority

- **Capability ID**: `control-plane-state-authority`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
Kernel이 Relay의 여러 orchestration surface를 대체하면서 보존해야 하는 핵심 authority capability다.

## Subcapabilities Allocation
- **State transition authority** (`state-transition-authority`): `CORE` — 런타임 라이프사이클 상태 전이 단일 권위
  - Implementations: 4 files bound
  - Proofs: control-plane-lifecycle, workflow-state-machine
- **Minimal durable state** (`minimal-durable-state`): `CORE` — SQLite 어댑터 기반 실행 상태 영속화 및 투영
  - Implementations: 3 files bound
  - Proofs: state-projection

## Follow-up Directives
- 새 state field는 owner, persistence, projection과 completion impact를 함께 정의한다.
