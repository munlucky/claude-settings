# Verification Contract

downstream 프로젝트가 harness에 검증 기대치를 선언하는 방법을 정의합니다.

## 권장 파일

` .claude/verification.contract.yaml `

## 권장 형태

```yaml
commands:
  typecheck: "npm run typecheck"
  build: "npm run build"
  test: "npm test"
  lint: "npm run lint"
  workflowParity: "bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan"
scope:
  executionPlanes:
    - product_project
  paths:
    - "src/**"
    - "tests/**"
  fallbackOutsideScope: true
runtime:
  url: "http://localhost:3000"
  e2eCommand: "npm run test:e2e"
  browserFlows:
    - name: "dashboard-smoke"
      entry: "/dashboard"
      markers:
        - "Dashboard"
      criticalInteractions:
        - "create item"
        - "delete item"
      passIf:
        - "primary action succeeds"
        - "list refreshes"
artifacts:
  verdict: ".claude/verification-verdict-<runId>.json"
  runtimeVerdict: ".claude/runtime-verdict-<runId>.json"
  sprintContract: ".claude/execution/<slice>/SPRINT_CONTRACT.md"
  qaReport: ".claude/execution/<slice>/QA_REPORT.md"
  handoff: ".claude/execution/<slice>/HANDOFF.md"
  scorecard: ".claude/execution/<slice>/SCORECARD.md"
  requirementsTraceability: ".claude/execution/REQUIREMENTS_TRACEABILITY.md"
  scenarioMatrix: ".claude/execution/SCENARIO_MATRIX.md"
  uatChecklist: ".claude/execution/UAT_CHECKLIST.md"
workflowEvidence:
  selectedHarnessComponents: []
  skippedHarnessComponents: []
  selectionReason: ""
  runtimeIsolation: ""
  modelEffortProfile: "standard" # economy | standard | deep | max
  selectedModelProvider: ""
  selectedModel: ""
  selectedModelEffort: ""
  modelSelectionReason: ""
strict:
  required: false
  triggers:
    - "auth"
    - "payment"
    - "deployment"
policySets:
  knowledge:
    description: "지식 저장소 신선도 및 구조 체크"
    checks:
      - docsAudit
  workflow:
    description: "워크플로우 규율 및 실행 경계 체크"
    checks:
      - workflowParity
  verification:
    description: "실행 가능한 검증 명령"
    checks:
      - typecheck
      - build
      - lint
  security:
    description: "기계적으로 검사 가능한 보안/코드 정책"
    checks:
      - securityScan
policy:
  allowIndeterminate: true
  requiredPolicySets:
    - knowledge
    - workflow
    - verification
  requiredChecks:
    - typecheck
    - build
    - lint
    - workflowParity
  optionalChecks:
    - test
    - runtime
qa:
  evaluatorMode: "separate"
  hardFailOn:
    - "core_user_flow_broken"
    - "runtime_error"
    - "contract_mismatch"
  criteria:
    functionality:
      threshold: "pass"
      focus:
        - "critical user flow"
        - "state change persists"
    requirementsCoverage:
      threshold: "pass"
      focus:
        - "every in-scope REQ has verification evidence"
        - "no requirement is closed without traceability"
    scenarioCoverage:
      threshold: "pass"
      focus:
        - "every critical SCN has runtime or E2E evidence"
        - "browser flows are mapped to user-visible scenarios"
    uatReadiness:
      threshold: "warn"
      focus:
        - "uat_ready is explicit"
        - "uat_complete is not inferred from automation"
    productDepth:
      threshold: "warn"
      focus:
        - "feature is not stub-only"
    visualQuality:
      threshold: "warn"
      focus:
        - "layout is coherent"
        - "UI avoids generic defaults"
    codeQuality:
      threshold: "warn"
      focus:
        - "no obvious dead path"
        - "no route shadowing"
hooks:
  extraChecksCommand: ""
loop:
  mode: "score_based"
  stopOnFailure: true
  scorecardRequired: true
  scorecardProfile: "auto"
  targetCompletionScore: 100
```

## 규칙
- harness는 verdict 의미를 책임지고, 프로젝트별 프레임워크 로직은 계약으로 선언합니다.
- 프로젝트는 명령어와 evidence를 이 계약으로 제공합니다.
- 계약은 로컬 `policySets` 로 체크를 묶어둘 수 있으며, 이는 향후 외부 정책 엔진에 매핑하기 전까지 저장소 내부의 거버넌스 단위로 사용합니다.
- 계약은 `scope` 를 선언해 required check 적용 범위를 plane/path 단위로 제한할 수 있으며, 범위 밖에서는 활성 워크스페이스 계약이나 fallback 감지를 사용합니다.
- 완료 기준은 모호한 품질 표현이 아니라 재현 가능한 실패 체크로 작성해야 합니다.
- cross-runtime 동작은 런타임별 프롬프트가 아니라 공통 계약 필드로 제어합니다.
- `workflowEvidence`에는 선택/생략한 하네스 컴포넌트, 선택 이유, runtime isolation, model effort profile을 기록합니다.
- runtime-neutral effort profile은 `economy`, `standard`, `deep`, `max`입니다. Provider-neutral 모델 라우팅이 이를 runtime별 model/effort control로 매핑합니다.
- 런타임 비중이 크거나 UI 비중이 큰 작업은 generator 자기승인보다 별도 evaluator 경로를 우선합니다.
- 브라우저/런타임 검증은 단순 첫 화면 확인이 아니라 실제 상호작용을 포함해야 합니다.
- 구현 시작 전 `SPRINT_CONTRACT.md`로 라운드 완료 기준을 먼저 고정합니다.
- medium, complex, phase, high-risk, runtime-heavy 작업은 구현 전에 evaluator contract review를 포함해야 합니다.
- 문서 추적 중심 downstream 작업에서는 `REQUIREMENTS_TRACEABILITY.md`, `SCENARIO_MATRIX.md`, `UAT_CHECKLIST.md`를 1급 실행 아티팩트로 취급합니다.
- 검증 실패 시 `QA_REPORT.md`를 다음 수정 라운드의 입력으로 사용합니다.
- score 기반 루프에서는 `SCORECARD.md`를 active slice의 객관적 완료 아티팩트로 사용합니다.
- `scorecardProfile`은 `generic`, `saas`, `api-backend`, `frontend`, `platform` 중 하나로 명시할 수 있고 기본값은 `auto`입니다.
- `auto`는 task intent나 phase 문맥에서 profile을 추론하고, 감지된 `REQ-*` / `SCN-*` 개수로 `REQ + SCN` 예산만 재배분할 수 있습니다.
- contract 기반 성공 판정은 현재 scope에 적용되는 모든 required check에 대해 최신 증거가 있을 때만 가능합니다.
- 완료 가능 summary 는 completion 관련 주장마다 아래 provenance 를 남겨야 합니다.
  - command 또는 verifier 이름
  - artifact 경로
  - 이번 실행에서 생성된 증거인지 여부
- remediation loop 를 닫기 전에 `QA_REPORT.md` 는 review finding 을 `accepted`, `challenged`, `deferred`, `needs_clarification` 중 하나로 분류해야 합니다.
- `should pass`, `looks good`, `likely fixed`, `seems resolved`, `done pending verification` 같은 표현으로 증거 부족을 긍정 판정으로 바꾸지 않습니다.
- review 항목이 불명확하면 연결된 remediation 경로를 계속하기 전에 먼저 명확화합니다.
- 로컬 `policySets` 는 저장소 내부 추상화이며, OPA/Policy-as-Code 같은 외부 엔진 연계는 향후 단계로 남겨둡니다.
- document-trace completion을 주장하려면 추가로 아래가 필요합니다.
  - in-scope `REQ-*` 전부에 구현 및 검증 증거가 있어야 함
  - critical `SCN-*` 전부에 fresh runtime 또는 E2E 증거가 있어야 함
  - clean finish를 주장할 때 critical `SCN-*` runtime evidence가 smoke-only보다 깊어야 함
  - `uat_ready` 와 `uat_complete` 를 명시적으로 구분해야 함
- Claude/Codex 두 런타임을 모두 지원하는 harness라면, runtime parity를 QA 메모로만 두지 말고 두 adapter 경로를 실제로 실행하는 parity command를 contract에 넣어야 합니다.
- 어떤 required check가 또 다른 verifier 내부에서 실행된다면, 중첩 검증이 자기 자신을 다시 호출하지 않도록 `VERIFY_CHANGES_SKIP_CHECKS=phaseRuntimeParity` 같은 명시적 skip 장치를 둬야 합니다.
- 계약이 없으면:
  - standard 프로필은 경고와 함께 진행할 수 있습니다.
  - strict 프로필은 완료 판정을 차단해야 합니다.
- 프로젝트 전용 도메인 검사는 공용 verifier 스크립트에 하드코딩하지 말고 opt-in hook으로 연결합니다.
- 하네스가 score 기반 루프를 쓴다면:
  - 기본 score verdict는 `retry`
  - 실패한 phase는 기본적으로 다음 phase로 자동 진행하지 않고 중단
  - 완료는 검증 통과와 `SCORECARD.md`의 `done`을 함께 요구
- retry evidence에는 `retryStrategy`, `deltaHypothesis`, `repeatedFailurePolicy`를 기록해야 합니다. 같은 failure class가 두 번 반복되면 `partial_redesign` 또는 `stop_and_handoff`가 필요합니다.
