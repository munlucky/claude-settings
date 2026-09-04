# Capability Decisions: Retrospective and regression learning

- **Capability ID**: `retrospective-and-regression-learning`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
반복 실패를 잊지 않게 하는 OPTIONAL learning asset이지만 runtime 권위와 분리한다.

## Subcapabilities Allocation
- **Daily retro collection** (`daily-retro-collection`): `OPTIONAL` — 일일 회고 및 장애 신호 수집
  - Implementations: 3 files bound
  - Proofs: retro-collect, retro-redaction
- **Improvement proposals** (`improvement-proposals`): `OPTIONAL` — 회고 기반 개선 제안 및 이슈 초안 작성
  - Implementations: 1 files bound
  - Proofs: retro-no-promotion

## Follow-up Directives
- 새 candidate type은 promotion authority와 rejection path를 먼저 정의한다.
