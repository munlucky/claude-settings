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
artifacts:
  verdict: ".claude/verification-verdict-<runId>.json"
  runtimeVerdict: ".claude/runtime-verdict-<runId>.json"
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
hooks:
  extraChecksCommand: ""
```

## 규칙
- harness는 verdict 의미를 책임지고, 프로젝트별 프레임워크 로직은 계약으로 선언합니다.
- 프로젝트는 명령어와 evidence를 이 계약으로 제공합니다.
- 계약이 없으면:
  - standard 프로필은 경고와 함께 진행할 수 있습니다.
  - strict 프로필은 완료 판정을 차단해야 합니다.
- 프로젝트 전용 도메인 검사는 공용 verifier 스크립트에 하드코딩하지 말고 opt-in hook으로 연결합니다.
