---
name: verification-evidence-gate
description: strict 워크플로우에서 최신 검증 증거가 없으면 완료/성공 선언을 차단한다.
---

# 검증 증거 게이트

## 역할
strict 프로필 실행에서 완료 선언 전 증거 우선 원칙을 강제합니다.

## 사용 시점
- `completion-verifier` 이후(또는 simple 흐름의 fallback 검증 이후).
- "완료/통과/수정 완료"와 같은 선언 직전.

## 입력
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*` (있을 경우)
- `analysisContext.notes`

## 게이트 로직
1. `workflowProfile != strict`이면 통과 처리하고 메모만 남깁니다.
2. `strict`에서는 최신 증거를 필수로 요구:
   - 우선 기준: `completionStatus.verificationState == passed`
   - 대체 기준: notes에 검증 명령 결과 성공 증거가 명시됨
3. 즉시 차단 조건:
   - `verificationState == failed`
   - `verificationState == indeterminate`
   - 최신 검증 실행 증거 없음
4. 차단 시 완료 선언을 막고 보정 지침을 반환합니다.

## 출력 (patch)
```yaml
notes:
  - "verification-evidence-gate: passed (strict)"
completionStatus:
  gateDecision: pass
```

차단 예시:
```yaml
completionStatus:
  gateDecision: failed
notes:
  - "verification-evidence-gate: blocked (missing fresh evidence)"
missingInfo:
  - category: verification-evidence
    priority: HIGH
    question: "완료 선언 전에 필요한 검증 명령 결과를 실행하고 출력해 주세요."
    reason: "strict 프로필에서는 완료 선언 전에 검증 증거가 필수입니다."
```

## 규칙
- 이 게이트가 차단 상태이면 성공/완료를 선언하지 않습니다.
- 오래된 결과나 추정 기반 검증은 인정하지 않습니다.
- 이 게이트는 정책 검증용이며 소스 코드를 수정하지 않습니다.
