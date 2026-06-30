# Phase 06: Brownfield Codebase Flow (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-06 | Master `Brownfield Codebase Mode` | Existing repo work starts from architecture recovery and fit-gap | repository evidence fixture, impact map, migration contract |

## 목표

- 기존 코드베이스에서 objective/PRD를 받았을 때 current architecture recovery와 fit-gap을 먼저 수행하도록 만든다.
- owned/read-only/staged path, migration risk, compatibility contract가 PLAN 이전에 확정되게 한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn: ["02", "03", "04"]
  conflictsWith: ["07", "08"]
  ownedPaths:
    - "tests/moonshot-architecture-brownfield-flow.test.mjs"
    - "tests/fixtures/moonshot-architecture/brownfield/**"
    - "skills/codebase-architecture-recovery/**"
    - "templates/architecture/**"
    - "scripts/architecture-artifact-validate.mjs"
    - "package.json"
    - "tests/package-layout.test.mjs"
  readOnlyPaths:
    - "scripts/architecture-context-build.mjs"
    - "docs/public/guidelines/brownfield-architecture-recovery.md"
    - "docs/public/guidelines/brownfield-architecture-recovery.ko.md"
    - "schemas/architecture/**"
  stagedPaths:
    - "tests/moonshot-architecture-brownfield-flow.test.mjs"
    - "tests/fixtures/moonshot-architecture/brownfield/**"
    - "package.json"
    - "tests/package-layout.test.mjs"
  sharedMutablePaths:
    - "templates/architecture/**"
    - "scripts/architecture-artifact-validate.mjs"
    - "package.json"
    - "tests/package-layout.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge_for_shared_validator"
```

## 범위

- 포함:
  - Brownfield fixture repository snapshot or minimal code fixture.
  - current architecture evidence assertions.
  - PRD fit-gap, impact map, migration strategy, compatibility contract.
  - SPEC_DELTA and PLAN readiness checks.
  - active test gate wiring for the Brownfield flow test.
- 제외:
  - live repository mutation outside fixture.
  - account-root or service profile adoption.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P06-1 | Brownfield fixture | small repo/objective fixture 작성 | fixture contains evidence-backed current architecture |
| P06-2 | Recovery contract | codebase recovery skill/test 연결 | architecture claims cite repo paths |
| P06-3 | Fit-gap and impact | PRD_FIT_GAP, IMPACT_MAP, MIGRATION_STRATEGY 검증 | owned/read-only/staged paths present |
| P06-4 | Handoff readiness | SPEC_DELTA/PLAN/TRACEABILITY validation | suitable for plan-writer handoff |
| P06-5 | Active gate wiring | Brownfield flow test를 `npm test`에 편입 | package layout gate confirms test is active |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P06-1 | `tests/fixtures/moonshot-architecture/brownfield/**` | none | `tests/moonshot-architecture-brownfield-flow.test.mjs` | `npm test -- tests/moonshot-architecture-brownfield-flow.test.mjs` | exit 0 |
| P06-2 | none | `skills/codebase-architecture-recovery/**` | same | same | path evidence assertions pass |
| P06-5 | none | `package.json`, `tests/package-layout.test.mjs` | `tests/package-layout.test.mjs` | `npm run test:package` | exit 0 |

## Blockers And Review

- Blocker condition: current architecture claim has no repository evidence.
- First review checkpoint: after fixture current architecture and fit-gap validate.
- Re-review trigger: Brownfield flow invents new architecture before reading existing constraints.
- Verification evidence path: `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/munlucky-moonshot-relay/execution/.../plans/moonshot-architecture-2026-06-08/runs/<runId>/execution/phase-06/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/moonshot-architecture-brownfield-flow.test.mjs`
- [ ] `node scripts/architecture-artifact-validate.mjs --mode brownfield_codebase --path tests/fixtures/moonshot-architecture/brownfield/package --repo-root tests/fixtures/moonshot-architecture/brownfield/repo --json`
- [ ] `npm run test:package`
- [ ] `npm test`
- [ ] `git diff --check`

## 완료 표시용 증거

- Brownfield fixture validation output.
- evidence citation coverage summary.
- owned/read-only/staged path mapping.

## 핸드오프 메모

- Phase 07 must preserve Brownfield incremental architecture boundaries and must not route directly from PRD to implementation.
