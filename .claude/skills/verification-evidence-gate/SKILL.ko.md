---
name: verification-evidence-gate
description: strict 실행에서 최신 검증 증거가 없을 때 완료 선언을 차단할 때 사용합니다.
---

# 검증 증거 게이트

## 역할
strict 프로필에서 evidence-before-completion 원칙을 강제합니다.

strict 실행에서는 Finish / Handoff로 넘어가기 전에 Verify stage를 닫는 마지막 게이트입니다.

## 입력
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*`
- `analysisContext.notes`
- `analysisContext.artifacts.verificationContractPath`
- 최신 verifier verdict artifact, 특히 `verdict.workflowEvidence.*`

## 게이트 로직
1. strict가 아니면 통과 메모만 남깁니다.
2. strict면 최신 증거가 필요합니다.
   - 우선 기준: `completionStatus.verificationState == passed`
   - 가능하면 `completionStatus.evidenceFresh == true`여야 합니다.
   - verifier artifact가 있으면 자유형 notes보다 그 구조화된 증거를 우선합니다.
   - 대체 기준: 이번 실행의 contract 기반 검증 명령 성공 증거가 notes에 남아 있음
3. 즉시 차단:
   - `verificationState == failed`
   - `verificationState == indeterminate`
   - `contractApplicable == true`이고 `requiredChecks.missing`이 비어 있지 않음
   - `verificationMode == contract`이고 `requiredChecks.missing`이 비어 있지 않음
   - contract 기반 판정인데 `evidenceFresh == false`
   - 코드 변경 마감인데 `verdict.workflowEvidence.warnings`가 비어 있지 않음
   - bounded-direct 마감인데 verifier artifact의 `workflowEvidence.detected == false`
   - `completionStatus.score.verdict != done`
   - `completionStatus.score.current < completionStatus.score.target`
   - `completionStatus.score.unmetChecklistItems > 0`
   - `completionStatus.score.blockingDefects > 0`
   - 최신 증거 없음

## 규칙
- 차단 상태이면 성공/완료를 선언하지 않습니다.
- 오래된 결과나 추정은 인정하지 않습니다.
- 가능하면 contract에 정의된 artifact 경로를 우선 신뢰합니다.
- 구조화된 `verdict.workflowEvidence` 경고가 있으면 수동 해석보다 그것을 우선 신뢰합니다.
- contract 기반 검증에서 최신 증거 없는 pass 상태는 여전히 차단합니다.
- 코드 변경 마감에서 review/finish workflow evidence가 없으면 이를 선택적 메타데이터가 아니라 차단 사유로 봅니다.
- score 기반 루프에서는 미완료 score verdict도 최신 검증 증거 부족으로 취급합니다.
