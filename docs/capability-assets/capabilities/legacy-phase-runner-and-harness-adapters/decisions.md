# Capability Decisions: Legacy phase runner and harness adapters

- **Capability ID**: `legacy-phase-runner-and-harness-adapters`
- **Disposition**: `archive`
- **Subcapabilities Count**: 2

## Rationale
Relay 역사와 실패 교훈은 보존하지만 현재 Kernel runtime에 재도입하지 않는다.

## Subcapabilities Allocation
- **Legacy phase runner** (`legacy-phase-runner`): `DEPRECATED` — 구 Relay phase 실행 및 임차 정책 (비교용)
  - Implementations: 5 files bound
  - Proofs: legacy-phase-runner, legacy-phase-runtime
- **Legacy harness adapters** (`legacy-harness-adapters`): `DEPRECATED` — 아카이브된 과거 하네스 어댑터 (재도입 금지)
  - Implementations: 2 files bound
  - Proofs: legacy-harness-inventory

## Follow-up Directives
- decomplexification은 이 asset을 근거로 별도 승인·계약·migration 계획에서만 수행한다.
