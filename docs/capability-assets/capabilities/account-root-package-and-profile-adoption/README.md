# Account-root package and profile adoption

- **ID**: `account-root-package-and-profile-adoption`
- **Domain**: `EXECUTION`
- **Family Status**: `HOST`
- **Summary**: Kernel package를 build/materialize하고 account-root profile에 소유권과 parity를 지켜 투영한다.

## Subcapabilities (Decomplexification 단위)
- **`package-materialization`** [`HOST`]: 계정 루트 패키지 빌드 및 매니페스트 생성
- **`account-profile-projection`** [`HOST`]: 프로필 설치, 섀도우 격리 및 동등성 검증

## 해결하는 문제
- package source와 installed account-root profile의 parity drift
- installer가 Provider auth, session, cache와 user config를 덮는 문제

## 해결하지 않는 문제
- host별 설치 권한과 filesystem availability
- 설치 후 provider login 상태

## 권장 사용
- manifest와 package materialization을 검증한 뒤 profile ownership을 확인한다.
- install/rollback receipt와 current/target path를 기록한다.

## 금지 사용
- asset index를 installer payload에 추가하지 않는다.
- account-root 전체를 Kernel 소유로 간주하지 않는다.

## 재도입 가이드
- **권장 레이어**: Kernel package build and host installer
- **트리거**: 새 profile, package file 또는 account-root integration을 추가할 때
- **통합 지점**:
  - manifest
  - package materialization
  - ownership audit
  - install/rollback
  - parity receipt
- **위험 요소**:
  - user data overwrite
  - installed/source drift
  - wrong account root
  - partial rollback
- **안전 가드레일**:
  - ownership and path containment
  - preserve external surface
  - atomic projection
  - host receipt
