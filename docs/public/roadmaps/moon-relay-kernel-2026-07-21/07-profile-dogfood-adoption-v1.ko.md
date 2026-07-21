# Phase 07 - Profile Isolation, Dogfood, and Controlled Adoption

## Objective

Relay와 Kernel을 같은 계정에 설치해도 스킬·훅·상태·완료 권한이 섞이지 않도록 profile을 구현하고, Codex 앱 프로젝트 분리와 A/B dogfood를 거쳐 채택 여부를 판정한다.

## Surface Classification

- `source_only`: profile templates, installer adapters, tests, docs.
- `package_runtime_payload`: Kernel profile materialization.
- `installed_profile_or_account_root`: disposable HOME 검증 이후 operator 승인 시에만 live adoption.

## Owned Paths

```text
package/kernel/profile-templates/**
scripts/kernel/profile-build.mjs
scripts/kernel/profile-install.mjs
scripts/kernel/profile-doctor.mjs
scripts/kernel/project-hydrate.mjs
tests/fixtures/kernel-profiles/**
tests/kernel-profile-isolation.test.mjs
tests/kernel-codex-project-isolation.test.mjs
tests/kernel-install-uninstall-matrix.test.mjs
tests/kernel-dogfood-gates.test.mjs
docs/public/guidelines/moon-relay-kernel-codex-app.md
docs/public/guidelines/moon-relay-kernel-installation.md
```

## Read-Only Paths

```text
package/profile-templates/**
scripts/install-account-root-harness.mjs
package/package-contract.yaml
package/build-package.mjs
tests/provider-profile-isolation-contract.test.mjs
tests/package-*.test.mjs
tools/harness-lab/**
```

## Requirements

- KRN-REQ-001, 012, 013, 017, 018, 019.

## Work

1. Claude, Codex CLI, Codex 앱, Qwen profile에서 Kernel public catalog만 materialize한다.
2. Relay와 Kernel의 hook, skill root, runtime home, state DB, cache, logs, manifest를 분리한다.
3. Codex 앱용 `[Relay]`/`[Kernel]` base worktree와 프로젝트 marker hydration을 구현한다.
4. 전역 `~/.agents/skills`에 양쪽 전체 카탈로그를 동시에 노출하지 않는다.
5. 임시 HOME에서 설치 순서, 재설치, 제거, rollback, symlink/junction 경계를 검증한다.
6. 30개 대표 task를 Relay와 Kernel에서 A/B 실행한다.
7. hard gate와 quality gate 결과를 promotion report로 합성한다.
8. live adoption은 operator 승인 후 별도 실행하며, main 승격은 자동화하지 않는다.

## Acceptance Criteria

- Kernel 프로젝트에서 Relay public skill이 발견되지 않고 반대도 동일하다.
- Codex 앱에서 프로젝트 선택만으로 active harness가 결정된다.
- wrong-harness 호출은 상태를 변경하지 않고 거부된다.
- 어느 설치·제거 순서에서도 다른 트랙의 manifest/state/profile이 바뀌지 않는다.
- false completion, security regression, state/profile contamination이 0이다.
- 전체 package/routing/eval/lab/regression gate가 통과한다.

## Spec-Test Obligations

- `KRN-SCN-001`~`003`, `012`, `013` 필수.
- macOS symlink, Windows junction, disposable HOME, offline install fixture.
- live account-root adoption은 `evidence_mandatory`이며 승인과 rollback evidence를 요구한다.

## Verification

```bash
node --test tests/kernel-profile-isolation.test.mjs tests/kernel-codex-project-isolation.test.mjs tests/kernel-install-uninstall-matrix.test.mjs tests/kernel-dogfood-gates.test.mjs
npm run test:package
npm run test:routing
npm run test:eval
npm run test:lab
npm test
```

## Evidence

```text
artifacts/kernel/phase-07/profile-discovery-matrix.json
artifacts/kernel/phase-07/install-uninstall-matrix.json
artifacts/kernel/phase-07/codex-app-project-report.json
artifacts/kernel/phase-07/relay-kernel-ab-report.json
artifacts/kernel/phase-07/promotion-decision.json
artifacts/kernel/phase-07/rollback-receipt.json
```

## Risks and Rollback

- 앱·CLI별 discovery 차이로 mixed catalog가 생길 수 있다. 각 provider를 독립 fixture로 검증한다.
- live adoption 실패 시 Kernel profile과 runtime home만 제거하고 Relay 경로는 건드리지 않는다.
- hard gate 실패 시 Kernel은 dogfood 상태에 머물고 main으로 승격하지 않는다.