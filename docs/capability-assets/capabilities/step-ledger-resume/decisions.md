# Capability Decisions: Step ledger and resume

- **Capability ID**: `step-ledger-resume`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
Relay의 phase 진행 자산을 Kernel의 단일 step ledger로 통합해 보존할 가치가 있는 CORE capability다.

## Subcapabilities Allocation
- **Run step ledger** (`run-step-ledger`): `CORE` — 단계별 순차 실행 상태 및 영속 원장 권위 유지
  - Implementations: 5 files bound
  - Proofs: run-step-ledger, run-step-safe-scope
- **Work cursor resume** (`work-cursor-resume`): `CORE` — 실행 커서 및 안전한 세션 재개 단일 권위
  - Implementations: 5 files bound
  - Proofs: run-step-resume

## Follow-up Directives
- legacy phase runner를 재도입하지 말고 step-level compatibility가 필요한지 별도 계약으로 판단한다.
