# Account-root package and profile adoption

- **ID**: `account-root-package-and-profile-adoption`
- **Category**: `EXECUTION`
- **Status**: `HOST`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
Kernel package를 build/materialize하고 account-root profile에 소유권과 parity를 지켜 투영한다.

## Subcapabilities Traceability
### `package-materialization` (HOST)
- **Name**: Package materialization
- **Role**: 계정 루트 패키지 빌드 및 매니페스트 생성
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/package-build.mjs` (current source)
  - `scripts/kernel/installer.mjs` (current source)
  - `skills/moonshot-relay-setup/SKILL.md` (current source)
  - `package/kernel/manifest.json` (historical commit: `c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`)
- **Proof References**:
  - `package-materialization`
  - `install-isolation`

### `account-profile-projection` (HOST)
- **Name**: Account profile projection
- **Role**: 프로필 설치, 섀도우 격리 및 동등성 검증
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/profile-build.mjs` (current source)
  - `scripts/kernel/profile-install.mjs` (current source)
  - `scripts/kernel/profile-projection.mjs` (current source)
  - `skills/moonshot-relay-maintainer/SKILL.md` (current source)
- **Proof References**:
  - `profile-ownership`


## Proof Tests
- **package-materialization**: `tests/kernel-package-materialization.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **install-isolation**: `tests/kernel-install-isolation.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **profile-ownership**: `tests/kernel-profile-ownership.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: Kernel 사용 surface를 안전하게 채택하기 위한 HOST boundary이며 runtime core와 분리해 보존한다.
