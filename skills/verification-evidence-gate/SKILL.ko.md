---
name: verification-evidence-gate
description: strict 실행에서 최신 검증 증거가 없을 때 완료 선언을 차단할 때 사용합니다.
---

# 검증 증거 게이트

## 역할
strict evidence-before-completion 정책을 위한 deprecated compatibility shim입니다.

활성 strict evidence 정책은 `completion-verifier`, `scripts/verification-plane.mjs`, `scripts/lib/verification-plane.mjs`, `scripts/runtime-state.mjs assess-completion`이 소유합니다. 새 workflow default는 이 skill을 직접 insert하지 않습니다.

## 사용 시점
- 오래된 bundle이 `verification-evidence-gate`를 명시 호출할 때만 legacy compatibility로 사용합니다.
- 현재 Verify stage assembly는 `completion-verifier`를 우선 사용합니다.

## 입력
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*`
- `analysisContext.notes`
- `analysisContext.artifacts.verificationContractPath`
- 최신 verifier verdict artifact, 특히 `verdict.workflowEvidence.*`

## 게이트 로직
1. 호출되면 현재 `completion-verifier` output에 정책 판단을 위임합니다.
2. `completionStatus.gateDecision != pass`, stale evidence, missing required checks는 blocked로 취급합니다.
3. 이 shim에서 독립적인 completion authority decision을 만들지 않습니다.

## 규칙
- 차단 상태이면 성공/완료를 선언하지 않습니다.
- completion-verifier, verification-plane, runtime-state 정책을 여기서 반복하지 않습니다.
- 오래된 결과나 추정은 인정하지 않습니다.
- 이 gate는 policy-only이며 source code를 수정하지 않습니다.
