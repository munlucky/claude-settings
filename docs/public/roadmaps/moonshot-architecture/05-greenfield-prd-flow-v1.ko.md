# Phase 05: Greenfield PRD Flow (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-05 | Master `Greenfield PRD Mode` | PRD-only input produces execution-ready architecture package | fixture flow, traceability, validation |

## 목표

- PRD-only input에서 architecture package를 생성하는 Greenfield flow를 검증 가능하게 만든다.
- accepted requirement가 scenario, ASR, ADR, PLAN task, verification signal로 이어지도록 traceability를 고정한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn: ["02", "03", "04"]
  conflictsWith: ["07", "08"]
  ownedPaths:
    - "tests/moonshot-architecture-greenfield-flow.test.mjs"
    - "tests/fixtures/moonshot-architecture/greenfield/**"
    - "templates/architecture/**"
    - "scripts/architecture-artifact-validate.mjs"
    - "skills/moonshot-architecture/SKILL.md"
    - "skills/moonshot-architecture/SKILL.ko.md"
    - "package.json"
    - "tests/package-layout.test.mjs"
  readOnlyPaths:
    - "scripts/architecture-context-build.mjs"
    - "schemas/architecture/**"
    - "docs/public/guidelines/moonshot-architecture.md"
    - "docs/public/guidelines/moonshot-architecture.ko.md"
  stagedPaths:
    - "tests/moonshot-architecture-greenfield-flow.test.mjs"
    - "tests/fixtures/moonshot-architecture/greenfield/**"
    - "package.json"
    - "tests/package-layout.test.mjs"
  sharedMutablePaths:
    - "templates/architecture/**"
    - "skills/moonshot-architecture/SKILL*.md"
    - "package.json"
    - "tests/package-layout.test.mjs"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge_for_shared_templates"
```

## 범위

- 포함:
  - Greenfield PRD fixture.
  - required architecture package fixture.
  - traceability and validator tests.
  - rejected alternatives and ADR completeness checks.
  - active test gate wiring for the Greenfield flow test.
- 제외:
  - Brownfield repository evidence.
  - product-orchestrator integration.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P05-1 | Greenfield fixture | PRD and expected package 작성 | fixture covers requirement, ASR, ADR, C4, PLAN |
| P05-2 | Flow test | fixture validates via artifact validator | missing ASR/ADR/traceability fails |
| P05-3 | Traceability test | req -> scenario -> ASR -> ADR -> task -> signal mapping | every accepted req has owner and verification signal |
| P05-4 | Skill doc alignment | Greenfield flow contract 보강 | hard stops match tests |
| P05-5 | Active gate wiring | Greenfield flow test를 `npm test`에 편입 | package layout gate confirms test is active |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P05-1 | `tests/fixtures/moonshot-architecture/greenfield/**` | none | `tests/moonshot-architecture-greenfield-flow.test.mjs` | `npm test -- tests/moonshot-architecture-greenfield-flow.test.mjs` | exit 0 |
| P05-2 | none | `scripts/architecture-artifact-validate.mjs` if needed | same | `node scripts/architecture-artifact-validate.mjs --mode greenfield_prd --path tests/fixtures/moonshot-architecture/greenfield/package` | exit 0 |
| P05-5 | none | `package.json`, `tests/package-layout.test.mjs` | `tests/package-layout.test.mjs` | `npm run test:package` | exit 0 |

## Blockers And Review

- Blocker condition: implementation PLAN can be produced without traceability matrix.
- First review checkpoint: after fixture output validates.
- Re-review trigger: Greenfield fixture requires Brownfield-only evidence.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-05/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/moonshot-architecture-greenfield-flow.test.mjs`
- [ ] `npm run test:package`
- [ ] `npm test`
- [ ] `git diff --check`

## 완료 표시용 증거

- Greenfield fixture validation output.
- traceability coverage summary.
- rejected alternative and ADR completeness evidence.

## 핸드오프 메모

- Phase 07 consumes the Greenfield handoff contract after Phase 06 also exists.
