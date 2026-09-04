# Capability Decisions: Account-root package and profile adoption

- **Capability ID**: `account-root-package-and-profile-adoption`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
Kernel 사용 surface를 안전하게 채택하기 위한 HOST boundary이며 runtime core와 분리해 보존한다.

## Subcapabilities Allocation
- **Package materialization** (`package-materialization`): `HOST` — 계정 루트 패키지 빌드 및 매니페스트 생성
  - Implementations: 4 files bound
  - Proofs: package-materialization, install-isolation
- **Account profile projection** (`account-profile-projection`): `HOST` — 프로필 설치, 섀도우 격리 및 동등성 검증
  - Implementations: 4 files bound
  - Proofs: profile-ownership

## Follow-up Directives
- 설치·동기화는 assetization baseline과 별도 host acceptance로 닫는다.
