# Capability Decisions: Harness surface and regression audit

- **Capability ID**: `harness-surface-and-regression-audit`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
자산화 자체와 future decomplexification에서 surface drift를 관찰하는 REFERENCE capability로 유지한다.

## Subcapabilities Allocation
- **Harness surface budget** (`harness-surface-budget`): `REFERENCE` — 저장소 파일/라인/토큰 표면 예산 측정
  - Implementations: 2 files bound
  - Proofs: surface-report
- **Regression audit reporting** (`regression-audit-reporting`): `REFERENCE` — 미등록 테스트 탐지 및 회귀 보고
  - Implementations: 3 files bound
  - Proofs: harness-regression, harness-history

## Follow-up Directives
- budget baseline 변경은 반드시 source count와 reason을 함께 갱신한다.
