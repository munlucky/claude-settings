# Phase 02: Architecture Artifact Templates and Schemas (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-02 | Master `Required New Files` | Architecture outputs must be contract-backed artifacts | templates, schemas, validator, fixture tests |

## 목표

- Greenfield/Brownfield architecture package 산출물을 markdown template와 JSON schema로 고정한다.
- 자유형 문서 작성이 아니라 validation 가능한 artifact contract를 만든다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-1"
  dependsOn: ["01"]
  conflictsWith: ["04", "05", "06", "08"]
  ownedPaths:
    - "templates/architecture/**"
    - "schemas/architecture/**"
    - "scripts/architecture-artifact-validate.mjs"
    - "tests/moonshot-architecture-template-contract.test.mjs"
    - "tests/moonshot-architecture-schema-contract.test.mjs"
    - "tests/fixtures/moonshot-architecture/artifacts/**"
  readOnlyPaths:
    - "templates/product-definition/**"
    - "schemas/verification.contract.yaml"
    - "tests/context-pack-contract.test.mjs"
  stagedPaths:
    - "templates/architecture/**"
    - "schemas/architecture/**"
    - "scripts/architecture-artifact-validate.mjs"
    - "tests/moonshot-architecture-*-contract.test.mjs"
    - "tests/fixtures/moonshot-architecture/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## 범위

- 포함:
  - master plan에 나열된 architecture templates.
  - architecture schemas.
  - artifact validator script.
  - Greenfield/Brownfield example package fixtures.
- 제외:
  - context builder implementation.
  - flow generation logic.
  - public skill exposure changes.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P02-1 | Template set 추가 | required template 목록 생성 | required template inventory is complete |
| P02-2 | Schema set 추가 | required schema 목록 생성 | schema files parse and cover required IDs |
| P02-3 | Validator 추가 | artifact path와 mode를 받아 validate | valid fixtures pass, malformed fixtures fail |
| P02-4 | Fixture tests | template/schema contract tests 작성 | negative cases are covered |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P02-1 | `templates/architecture/**` | none | `tests/moonshot-architecture-template-contract.test.mjs` | `npm test -- tests/moonshot-architecture-template-contract.test.mjs` | exit 0 |
| P02-2 | `schemas/architecture/**` | none | `tests/moonshot-architecture-schema-contract.test.mjs` | `npm test -- tests/moonshot-architecture-schema-contract.test.mjs` | exit 0 |
| P02-3 | `scripts/architecture-artifact-validate.mjs` | none | same | `node scripts/architecture-artifact-validate.mjs --help` | exit 0 |

## Blockers And Review

- Blocker condition: validator accepts missing ASR, missing ADR, or missing traceability for non-trivial package.
- First review checkpoint: after schema names and required fields are fixed.
- Re-review trigger: schema breaks existing package/materialization tests.
- Verification evidence path: `docs/implementation/moonshot-architecture-2026-06-08/execution/phase-02/QA_REPORT.md`

## 검증 계획

- [ ] `npm test -- tests/moonshot-architecture-template-contract.test.mjs tests/moonshot-architecture-schema-contract.test.mjs`
- [ ] `npm test`
- [ ] `git diff --check`

## 완료 표시용 증거

- valid Greenfield fixture validation output.
- valid Brownfield fixture validation output.
- negative fixture failure summary.

## 핸드오프 메모

- Phase 04 consumes the schema names and validator contract. Do not rename schema files after this phase without updating Phase 04.

