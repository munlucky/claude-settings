---
name: completion-verifier
description: Acceptance 테스트와 자체 점검으로 구현 완료를 검증하고 실패 시 재시도 루프를 유도한다.
context: fork
---

# Completion Verifier 스킬

## 사용 시점
- 각 구현 phase 완료 후
- 완료 선언 전
- 재시도 루프 트리거 시

## 입력
- `analysisContext.*`
- `context.md`
- `analysisContext.artifacts.verificationContractPath`
- `PROJECT.md` 또는 verification contract의 테스트/검증 명령
- `analysisContext.signals.allowIndeterminate`

## contract-first 정책
검증 명령 해석 우선순위:
1. `.claude/verification.contract.yaml`
2. `PROJECT.md` Testing Rules
3. 파일시스템/스크립트 자동 감지 fallback

## 핵심 규칙
- verification contract가 있으면 그 명령과 artifact를 우선 사용한다.
- contract가 없고 standard면 fallback 탐지를 허용한다.
- contract가 없고 strict면 앞단의 `verification-contract-gate`가 차단해야 한다.
- `verificationState: indeterminate`
  - standard -> `pass_with_warning`
  - strict -> `failed`

## 출력 예시

```yaml
completionStatus:
  testEnvironment: true | false
  contractDetected: true | false
  selfAuditOnly: false
  verificationState: passed | failed | indeterminate
  gateDecision: pass | failed | pass_with_warning
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
```

## 메모
- Self-Audit는 테스트를 보완하는 용도이지 대체물이 아니다.
- verdict artifact가 최종 검증 증거가 된다.
