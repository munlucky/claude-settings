# Decisions & Failure History: Retrospective and regression learning

- **Status**: `OPTIONAL`
- **Disposition**: `retain`

## 설계 및 보존 결정
반복 실패를 잊지 않게 하는 OPTIONAL learning asset이지만 runtime 권위와 분리한다.

### 후속 조치
- 새 candidate type은 promotion authority와 rejection path를 먼저 정의한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E3 (`1f7ed38b80f2d66d34498548448423c56154be16`, 2026-06-09)
- **Generations**:
  - **relay-awtl** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Awtl trace and improvement - 실패 turn, trace와 개선 후보를 회고 artifact로 수집했다.
  - **current-retro-contract** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Advisory retrospective - retro collection, redaction, proposal과 no-promotion authority를 분리했다.

## 알려진 결함 및 교훈 (Known Failures)
### silent-improvement-promotion (P1)
- **현상**: 실패 candidate가 review/commit 없이 runtime guidance나 canonical knowledge로 승격될 수 있었다.
- **원인**: retro collection과 promotion authority가 같은 lifecycle로 취급되었다.
- **교훈**: advisory-only 기본값과 explicit review/commit을 유지한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/retro-no-promotion-authority-contract.test.mjs`, `tests/retro-improvement-proposer-contract.test.mjs`
