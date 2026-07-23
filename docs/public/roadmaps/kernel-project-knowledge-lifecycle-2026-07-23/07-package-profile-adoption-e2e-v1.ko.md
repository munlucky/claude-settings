# Phase 07 — Package, Profile, Adoption, End-to-End v1

## Status

`blocked_by_phase_01_to_06`

## Objective

프로젝트 지식 라이프사이클과 Kernel Git closeout capability를 package/runtime payload에 안전하게 포함하고, disposable home과 샘플 프로젝트에서 install, profile discovery, E2E, uninstall, rollback을 검증한 뒤 제한적으로 live adoption 가능 상태를 만든다.

## Dependencies

- Phase 01~06 완료 및 fresh evidence

## Inputs and Read-only References

- `package/kernel/manifest.json`
- `package/kernel/skills.lock.json`
- `catalog/kernel-skills.json`
- `catalog/kernel-skills.yaml`
- `scripts/kernel/package-build.mjs`
- `scripts/kernel/profile-build.mjs`
- `scripts/kernel/profile-install.mjs`
- `scripts/kernel/profile-doctor.mjs`
- `scripts/kernel/installer.mjs`
- `bin/moon-relay-kernel.mjs`
- `bin/moon-harness-switcher.mjs`
- existing Kernel package/profile/isolation tests

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - package/kernel/manifest.json
  - package/kernel/skills.lock.json
  - package/kernel/profiles/**
  - catalog/kernel-skills.json
  - catalog/kernel-skills.yaml
  - scripts/kernel/package-build.mjs
  - scripts/kernel/profile-build.mjs
  - scripts/kernel/profile-install.mjs
  - scripts/kernel/profile-doctor.mjs
  - scripts/kernel/installer.mjs
  - bin/moon-relay-kernel.mjs
  - tests/kernel-knowledge-package.test.mjs
  - tests/kernel-knowledge-profile-isolation.test.mjs
  - tests/kernel-knowledge-lifecycle-e2e.test.mjs
  - tests/kernel-git-closeout-e2e.test.mjs
  - tests/kernel-knowledge-uninstall-rollback.test.mjs
adoptionTargets:
  - disposable HOME
  - disposable sample repository
  - optional operator-approved account-root Kernel profile
```

## Surface Classification

- package files: `package_runtime_payload`
- profile install/adoption: `installed_profile_or_account_root`
- Kernel project knowledge/runtime DB: `data_or_state_migration`
- optional Git push E2E: `external_deployment_or_service`, local bare remote fixture 우선

## Package Contents

포함:

- Kernel project identity and knowledge contracts
- knowledge store/load/render/retrieval/review/commit modules
- Kernel commit closeout adapter and schemas
- `moon-relay-kernel` public entrypoint
- internal `kernel-project-context-load`, `kernel-project-knowledge-review`, `kernel-project-knowledge-commit`, `kernel-commit-closeout`
- required schemas, policy, lock, tests/fixtures needed by installed doctor

제외:

- Relay project knowledge state
- raw knowledge records from source checkout
- runtime DB와 context packs
- user credentials/auth/session/cache
- live Git remote tokens
- generated planning/execution artifacts

## Capability Conditions

- `kernel-project-context-load`: 모든 non-trivial run의 FRAME, stage context rebuild
- `kernel-project-knowledge-review`: source mutation 또는 behavior change 후 PROVE 전
- `kernel-project-knowledge-commit`: accepted completion 후 candidate 존재 또는 explicit no-change receipt 요구
- `kernel-commit-closeout`: explicit Git closeout request only

`kernel-commit-closeout`은 profile-local public skill로 노출하지 않는다.

## E2E Scenarios

### Scenario A — First run, no knowledge configured

- project identity 생성
- `not_configured/advisory` context receipt
- task 수행 및 accepted completion
- verified candidate로 knowledge revision 1 생성
- Git closeout 미요청 skip

### Scenario B — Existing architecture/ontology knowledge

- FRAME/SHAPE에서 관련 slice 로드
- blocking constraint 위반 구현 시 PROVE fail
- 수정 후 fresh verification
- accepted completion 및 semantic/KG update

### Scenario C — Concurrent knowledge revision

- Run A/B 동일 start revision
- A commit 성공
- B knowledge commit conflict/re-review
- silent overwrite 없음

### Scenario D — Explicit commit only

- knowledge commit receipt 생성
- scoped staging 및 local commit
- push skipped, parity not_requested

### Scenario E — Explicit commit and push

- local bare remote fixture
- push success
- local HEAD와 remote SHA parity matched
- receipt completed

### Scenario F — Forbidden staging

- runtime DB, `.env`, generated bridge, raw knowledge state 변경 혼합
- hard deny/exclusion
- product source만 reviewed staging

### Scenario G — Uninstall and rollback

- manifest-owned package/profile 파일 제거
- user project knowledge 보존이 기본
- explicit `--purge-project-knowledge` + approval 없이는 knowledge state 삭제 금지
- Relay profile/state 무손상

## Adoption Sequence

1. source targeted tests
2. Kernel contract/eval tests
3. package dry-run and manifest parity
4. disposable HOME install
5. four runtime profile doctor/discovery
6. sample project E2E scenarios
7. uninstall/reinstall/rollback
8. full source gates
9. independent operational adoption review
10. operator 승인 후에만 live account-root adoption

## Required Commands

Repository policy에서 확인된 명령만 사용한다.

- `npm run test:kernel`
- `npm run test:package`
- `npm run test:routing`
- `npm run test:eval`
- `npm run test:lab`
- `npm test`

추가 targeted test 명령은 구현 시 `package.json` 또는 phase-local test policy에 등록한다.

## Acceptance Criteria

- package manifest와 skill lock에 모든 신규 capability가 일치한다.
- public profile surface는 `moon-relay-kernel` 하나를 유지한다.
- installed Kernel이 Relay DB/state/profile을 읽거나 변경하지 않는다.
- disposable E2E에서 knowledge revision과 receipts가 재현된다.
- Git closeout은 explicit request에서만 활성화된다.
- uninstall이 user knowledge를 기본 보존하고 Relay를 손상시키지 않는다.
- package/profile/runtime source parity와 rollback이 통과한다.
- full regression에 blocker가 없다.

## Verification and Evidence

- package materialization checksum/parity
- installed profile discovery surface audit
- disposable home doctor and E2E receipts
- local bare Git remote parity evidence
- uninstall/reinstall/rollback manifests
- independent security and operational review
- full command gate outputs

## Rollback

- live adoption 전: disposable artifacts 제거
- live adoption 후: install manifest 기반 Kernel-owned profile/runtime 파일만 복원/제거
- project knowledge는 기본 보존
- incompatible DB migration은 additive reader compatibility를 유지하고 feature flag disable로 rollback
- Relay track/profile은 rollback 대상에 포함하지 않는다.

## Completion Decision

전체 계획 완료는 Scenario A~G, package/profile isolation, full regression, operational adoption review가 통과하고 Kernel runtime-state completion authority가 accepted를 기록한 뒤에만 선언한다.