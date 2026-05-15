---
name: design-approval-gate
description: strict 워크플로우에서 설계/스펙 승인 없이 구현 단계로 진입하지 못하게 차단한다.
---

# 설계 승인 게이트

## 역할
strict 프로필에서 명시적 설계 승인 없이 구현으로 진입하는 것을 방지합니다.

## 사용 시점
- 첫 구현 단계 직전.
- 특히 `workflowProfile == strict`일 때.

## 입력
- `analysisContext.request.taskType`
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.hasContextMd`
- `analysisContext.signals.requirementsClear`
- `analysisContext.signals.hasPendingQuestions`
- `analysisContext.notes`

## 게이트 로직
1. `workflowProfile != strict`이면 차단하지 않고 메모만 남깁니다.
2. `strict`에서는 아래 조건이 모두 참일 때만 통과:
   - `hasContextMd == true`
   - `requirementsClear == true`
   - `hasPendingQuestions == false`
3. notes에 다음 승인 마커가 있으면 승인 증거로 인정:
   - `"design-approved"` 또는 `"spec-approved"`
4. 승인 증거가 없으면:
   - `signals.designApproved = false`
   - `signals.hasPendingQuestions = true`
   - 권장 단계 `planning`으로 반환

## 출력 (patch)
```yaml
signals:
  designApproved: true
  hasPendingQuestions: false
notes:
  - "design-approval-gate: passed (strict)"
```

차단 예시:
```yaml
phase: planning
signals:
  designApproved: false
  hasPendingQuestions: true
missingInfo:
  - category: design-approval
    priority: HIGH
    question: "구현 전에 설계/스펙 승인을 확인해 주세요."
    reason: "strict 프로필에서는 명시적 설계 승인이 필수입니다."
notes:
  - "design-approval-gate: blocked (missing approval evidence)"
```

## 규칙
- 이 게이트는 코드를 구현하지 않습니다.
- 이 게이트는 특정 파일 경로 규칙을 강제하지 않습니다.
- 차단 시 보정 방법을 명확히 반환하고 진행을 멈춥니다.
