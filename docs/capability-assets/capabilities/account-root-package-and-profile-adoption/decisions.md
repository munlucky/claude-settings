# Decisions & Failure History: Account-root package and profile adoption

- **Status**: `HOST`
- **Disposition**: `retain`

## 설계 및 보존 결정
Kernel 사용 surface를 안전하게 채택하기 위한 HOST boundary이며 runtime core와 분리해 보존한다.

### 후속 조치
- 설치·동기화는 assetization baseline과 별도 host acceptance로 닫는다.

## 계보 및 세대 (Provenance)
- **First Seen**: E4 (`c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`, 2026-07-22)
- **Generations**:
  - **kernel-package** (E4, `c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`): Kernel package and installer - Kernel package manifest와 account-root installer lifecycle을 도입했다.
  - **profile-adoption** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Profile adoption - profile build/install/projection과 ownership guard를 분리했다.
  - **current-boundary-audit** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Runtime boundary audit - Kernel-owned integration만 account-root에 투영하고 Provider surface를 보존한다.

## 알려진 결함 및 교훈 (Known Failures)
### profile-ownership-drift (P1)
- **현상**: 설치 시 Kernel projection이 Provider auth/session/cache 또는 user-owned profile을 덮을 수 있었다.
- **원인**: package source와 target ownership boundary가 명시적으로 검증되지 않았다.
- **교훈**: ownership, containment, installed parity와 rollback을 별도 receipt로 증명한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-install-isolation.test.mjs`, `tests/kernel-profile-ownership.test.mjs`, `tests/kernel-runtime-boundary-static.test.mjs`
