# Phase 02 - Runtime and Package Isolation

## Objective

Kernel 전용 CLI, package payload, runtime home, managed Node 경로를 추가하고 Relay와의 동시 설치 경계를 검증한다.

## Surface Classification

- `source_only`: Kernel resolver, schemas, tests.
- `package_runtime_payload`: `bin/moon-relay-kernel.mjs`, `package/kernel/**`.
- `installed_profile_or_account_root`: 설계·dry-run만, live adoption 금지.

## Owned Paths

```text
bin/moon-relay-kernel.mjs
kernel/runtime-policy.yaml
package/kernel/**
scripts/kernel/runtime-home.mjs
scripts/kernel/runtime-resolver.mjs
scripts/kernel/package-build.mjs
schemas/kernel.runtime-manifest.schema.json
tests/kernel-runtime-home-isolation.test.mjs
tests/kernel-package-materialization.test.mjs
tests/kernel-managed-runtime.test.mjs
tests/kernel-install-isolation.test.mjs
```

## Read-Only Paths

```text
package/build-package.mjs
package/package-contract.yaml
scripts/lib/moonshot-runtime-resolver.mjs
scripts/install-account-root-harness.mjs
scripts/project-identity.mjs
tests/runtime-*.test.mjs
```

## Requirements

- KRN-REQ-001, 014, 018.

## Work

1. 기본 runtime home을 `~/.moon-relay-kernel`로 정의한다.
2. Relay의 관리형 Node resolver를 공통 primitive로 재사용하되 manifest와 현재 포인터를 Kernel namespace로 분리한다.
3. Kernel payload가 Relay profile·state·cache를 포함하지 않도록 allowlist를 만든다.
4. 임시 HOME에서 Relay→Kernel, Kernel→Relay, 제거→재설치 순서를 검증한다.
5. Node 20·22·24 호스트에서도 payload 내부 Node가 우선되는 fixture를 만든다.

## Acceptance Criteria

- 두 제품의 runtime home, manifest, current runtime, checksum 경로가 겹치지 않는다.
- Kernel package dry-run이 Relay 파일 변경을 보고하지 않는다.
- Kernel 제거 이후 Relay doctor/package fixture가 그대로 통과한다.
- 폐쇄망 fixture에서 외부 다운로드 없이 동작한다.

## Spec-Test Obligations

- `KRN-SCN-001`, `KRN-SCN-012`, `KRN-SCN-013`을 install sequence fixture로 검증한다.
- package/runtime 변경은 `characterization_first`로 기존 Relay package 테스트를 먼저 고정한다.

## Verification

```bash
node --test tests/kernel-runtime-home-isolation.test.mjs tests/kernel-package-materialization.test.mjs tests/kernel-managed-runtime.test.mjs tests/kernel-install-isolation.test.mjs
npm run test:package
npm test
```

## Evidence

```text
artifacts/kernel/phase-02/package-dry-run.json
artifacts/kernel/phase-02/install-matrix.json
artifacts/kernel/phase-02/runtime-checksum-report.json
```

## Risks and Rollback

- 공통 installer 수정이 Relay에 회귀를 만들 수 있다. Kernel adapter를 우선하고 공통화는 중복이 실측될 때만 수행한다.
- live profile 설치는 Phase 07까지 보류한다.