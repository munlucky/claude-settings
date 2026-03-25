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
strict:
  required: false
  triggers:
    - "auth"
    - "payment"
    - "deployment"
policy:
  allowIndeterminate: true
  requiredChecks:
    - typecheck
    - build
    - lint
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
```

## 규칙
- harness는 verdict 의미를 책임지고, 프로젝트별 프레임워크 로직은 계약으로 선언합니다.
- 프로젝트는 명령어와 evidence를 이 계약으로 제공합니다.
- 완료 기준은 모호한 품질 표현이 아니라 재현 가능한 실패 체크로 작성해야 합니다.
- 런타임 비중이 크거나 UI 비중이 큰 작업은 generator 자기승인보다 별도 evaluator 경로를 우선합니다.
- 브라우저/런타임 검증은 단순 첫 화면 확인이 아니라 실제 상호작용을 포함해야 합니다.
- 구현 시작 전 `SPRINT_CONTRACT.md`로 라운드 완료 기준을 먼저 고정합니다.
- 검증 실패 시 `QA_REPORT.md`를 다음 수정 라운드의 입력으로 사용합니다.
- 계약이 없으면:
  - standard 프로필은 경고와 함께 진행할 수 있습니다.
  - strict 프로필은 완료 판정을 차단해야 합니다.
- 프로젝트 전용 도메인 검사는 공용 verifier 스크립트에 하드코딩하지 말고 opt-in hook으로 연결합니다.
