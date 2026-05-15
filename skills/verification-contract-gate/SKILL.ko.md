---
name: verification-contract-gate
description: downstream 프로젝트의 검증 계약 정보가 충분한지 확인하고, strict 모드에서 부족하면 차단합니다.
---

# Verification Contract Gate

## 역할
완료 판정 전에 downstream 프로젝트가 충분한 검증 의도를 선언했는지 확인합니다.

## 사용 시점
- `executionPlane == product_project`
- `completion-verifier` 또는 fallback shell verification을 신뢰하기 전에 사용

## 입력
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.verificationContractReady`
- `analysisContext.signals.workflowProfile`
- `analysisContext.artifacts.verificationContractPath`

## 게이트 로직
1. `executionPlane != product_project`이면 통과 메모만 남깁니다.
2. `verificationContractReady == true`이면 통과합니다.
3. `workflowProfile == standard`이면 경고와 함께 통과하고 계약 추가를 권장합니다.
4. `workflowProfile == strict`이면 계약이 준비될 때까지 차단합니다.

## 최소 검증 계약 영역
- 필수 명령어
- 필수 증거 artifact
- 런타임 검증 정책
- indeterminate 처리 정책
- strict-mode 승격 조건

## 출력 예시
```yaml
notes:
  - "verification-contract-gate: blocked in strict mode"
missingInfo:
  - category: verification-contract
    priority: HIGH
    question: "완료 전에 `.claude/verification.contract.yaml` 또는 동등한 검증 정책을 추가하세요."
completionStatus:
  gateDecision: failed
```

## 규칙
- 이 게이트는 테스트를 직접 실행하지 않습니다.
- downstream 검증 기대치가 충분히 선언되었는지만 확인합니다.
