# Phase 08: Regression and Evaluation Gates (v1)

## 소스 매핑

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MSA-REQ-08 | Master `Regression and Evaluation Gates` | Architecture design quality is testable and protected | regression/eval tests, package/install/closeout authority |

## 목표

- architecture design harness의 품질 차원을 active regression/eval gate로 묶는다.
- 전체 plan closeout이 fresh verification evidence와 `runtime-state.mjs assess-completion` accepted decision에 의해 결정되게 한다.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn: ["07"]
  conflictsWith: ["02", "04", "05", "06", "07"]
  ownedPaths:
    - "tests/moonshot-architecture-regression.test.mjs"
    - "tests/moonshot-architecture-greenfield-flow.test.mjs"
    - "tests/moonshot-architecture-brownfield-flow.test.mjs"
    - "tests/moonshot-architecture-context-pack.test.mjs"
    - "tests/harness-regression-contract.test.mjs"
    - "tools/evals/**"
    - "docs/public/guidelines/verification-workflow-evidence.md"
    - "docs/public/guidelines/verification-workflow-evidence.ko.md"
  readOnlyPaths:
    - "scripts/runtime-state.mjs"
    - "scripts/phase-final-guard.mjs"
    - "schemas/plan-closeout.schema.json"
    - "docs/public/runtime-control-plane.md"
    - "package/package-contract.yaml"
  stagedPaths:
    - "tests/moonshot-architecture-*.test.mjs"
    - "tests/harness-regression-contract.test.mjs"
    - "tools/evals/**"
    - "docs/public/guidelines/verification-workflow-evidence.md"
    - "docs/public/guidelines/verification-workflow-evidence.ko.md"
  sharedMutablePaths:
    - "tests/harness-regression-contract.test.mjs"
    - "tools/evals/**"
  requiresManualEvidence: false
  mergePolicy: "parent_serial_merge"
```

## 범위

- 포함:
  - positive Greenfield/Brownfield fixtures.
  - negative tests for missing ASR, ADR, traceability, raw KG leakage, missing verification signal.
  - package, installer, and final completion authority gates.
  - closeout evidence guidance.
- 제외:
  - relaxing completion authority planes.
  - replacing runtime-state DB completion authority.

## 상세 작업

| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P08-1 | Regression suite | quality dimensions encoded in tests | required dimensions have positive/negative coverage |
| P08-2 | Eval fixture | harness regression eval updated | architecture failures are caught |
| P08-3 | Package/install gates | package and installer dry-run included | source payload and runtime payload align |
| P08-4 | Whole-plan closeout | closeout evidence and assess-completion documented/executed | accepted DB decision required for clean finish |

## 정확한 실행 대상

| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Signal |
|---|---|---|---|---|---|
| P08-1 | `tests/moonshot-architecture-regression.test.mjs` | architecture tests as needed | same | `npm test -- tests/moonshot-architecture-regression.test.mjs` | exit 0 |
| P08-2 | eval fixtures as needed | `tools/evals/**` | `tests/harness-regression-contract.test.mjs` | `npm test -- tests/harness-regression-contract.test.mjs` | exit 0 |
| P08-3 | none | none | package tests | `npm run test:package` | exit 0 |
| P08-4 | closeout JSON under execution root | none | runtime-state evidence | `node scripts/runtime-state.mjs assess-completion --json` | accepted after fresh evidence |

## Blockers And Review

- Blocker condition: final success is claimed from `phase-status.yaml`, QA report, or scorecard without accepted DB decision.
- First review checkpoint: after all negative tests fail for the intended reason.
- Re-review trigger: any required completion plane is omitted from closeout evidence.
- Verification evidence path: `docs/public/roadmaps/moonshot-architecture/execution/phase-08/QA_REPORT.md`

## 검증 계획

- [ ] `npm test`
- [ ] `npm run test:package`
- [ ] `npm run test:eval`
- [ ] `node package/build-package.mjs --runtime all --dry-run --json`
- [ ] `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- [ ] `node scripts/phase-final-guard.mjs --mode check --status-file .moonshot-relay/docs/phase-status.yaml --json`
- [ ] `node scripts/runtime-state.mjs assess-completion --json`
- [ ] `git diff --check`

## 완료 표시용 증거

- unit/package/installer/browser/security/quality evidence summary.
- package and install dry-run output.
- `assess-completion` accepted decision payload.
- account-root sync status if runtime payload changed and sync was requested.

## 핸드오프 메모

- Do not mark the plan complete until this phase records whole-plan closeout authority.
