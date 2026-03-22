---
name: verification-evidence-gate
description: strict 워크플로우에서 최신 검증 증거가 없으면 완료 선언을 차단한다.
---

# 검증 증거 게이트

## 역할
strict 프로필에서 evidence-before-completion 원칙을 강제한다.

## 입력
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*`
- `analysisContext.notes`
- `analysisContext.artifacts.verificationContractPath`

## 게이트 로직
1. strict가 아니면 통과 메모만 남긴다.
2. strict면 최신 증거가 필요하다.
   - 우선 기준: `completionStatus.verificationState == passed`
   - 대체 기준: contract 기반 검증 명령의 성공 증거가 notes에 남아 있음
3. 즉시 차단:
   - `verificationState == failed`
   - `verificationState == indeterminate`
   - 최신 증거 없음

## 규칙
- 차단 상태이면 성공/완료를 선언하지 않는다.
- 오래된 결과나 추정은 인정하지 않는다.
- 가능하면 contract에 정의된 artifact 경로를 우선 신뢰한다.
