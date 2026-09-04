# Capability Decisions: Task contract and bounded work

- **Capability ID**: `task-contract-and-bounded-work`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
현재 Kernel의 실행 경계와 재현 가능한 작업 단위를 지탱하는 CORE capability다.

## Subcapabilities Allocation
- **Task contract binding** (`task-contract-binding`): `CORE` — 사용자 목적, 인수조건, 비목표를 불변 계약으로 바인딩
  - Implementations: 8 files bound
  - Proofs: task-contract-schema, bounded-work-unit
- **Work unit scope** (`work-unit-scope`): `CORE` — 허용/금지 경로 및 제한된 work-unit admission 경계 소유
  - Implementations: 4 files bound
  - Proofs: step-scope

## Follow-up Directives
- 새 capability를 추가할 때 contract owner와 completion owner를 분리해 기록한다.
