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
- `analysisContext.artifacts.sprintContractPath`
- `analysisContext.artifacts.qaReportPath`
- `analysisContext.artifacts.handoffPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- `TEST_GUIDE.md`, `PROJECT.md` 또는 verification contract의 테스트/검증 명령
- `analysisContext.signals.allowIndeterminate`

## contract-first 정책
검증 명령 해석 우선순위:
1. `.claude/verification.contract.yaml`
2. `TEST_GUIDE.md`
3. `PROJECT.md` Testing Rules
4. 파일시스템/스크립트 자동 감지 fallback

적용 범위 규칙:
- contract가 `scope` 를 선언하면 현재 execution plane 또는 변경 경로가 그 범위에 맞을 때만 required check를 적용합니다.
- contract 파일은 존재하지만 현재 scope에 적용되지 않으면, 관련 없는 required check를 강제하지 말고 활성 워크스페이스 계약이나 fallback 감지로 내려갑니다.

검증 환경 출력은 아래 상태를 구분해야 합니다.

```yaml
verificationEnvironment:
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
```

## 핵심 규칙
- verification contract가 있으면 그 명령과 artifact를 우선 사용한다.
- contract가 없고 standard면 fallback 탐지를 허용한다.
- contract가 없고 strict면 앞단의 `verification-contract-gate`가 차단해야 한다.
- `SPRINT_CONTRACT.md`가 있으면 그 done check도 함께 검증한다.
- verifier는 실행할 때마다 `QA_REPORT.md`를 갱신해야 한다.
- verification contract가 있으면 contract의 required check에 대한 최신 증거 없이는 성공 판정을 반환하지 않는다.
- `verificationState: indeterminate`
  - standard -> `pass_with_warning`
  - strict -> `failed`

## 출력 예시

```yaml
completionStatus:
  testEnvironment: true | false
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
  selfAuditOnly: false
  verificationState: passed | failed | indeterminate
  evidenceFresh: true | false
  requiredChecks:
    declared: []
    executed: []
    missing: []
  gateDecision: pass | failed | pass_with_warning
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
    fresh: true | false
qaReport:
  path: "{activeSliceDir}/QA_REPORT.md"
  updated: true | false
```

통과 규칙:
- `contractApplicable == true` 또는 `verificationMode == contract` 이면 `gateDecision: pass` 는 아래를 모두 만족해야 한다.
  - `verificationState == passed`
  - `evidenceFresh == true`
  - `requiredChecks.missing` 이 비어 있음
- 그 외에는 self-audit 만으로 완료 성공을 추론하지 않는다.

추가 규칙:
- contract 파일이 있어도 현재 scope 밖이면 `verificationMode=workspace` 또는 `fallback` 으로 내려가야 합니다.
- contract 적용 범위 안인데 required check를 실행하지 못하면 `gateDecision: pass` 를 반환할 수 없습니다.

## 메모
- Self-Audit는 테스트를 보완하는 용도이지 대체물이 아니다.
- verdict artifact가 최종 검증 증거가 된다.
- contract 기반 성공 판정에는 이번 실행에서 생성된 최신 verifier artifact 또는 동등한 명령 증거가 필요하다.
- 검증 실패나 중단 시에는 다음 라운드를 위해 `HANDOFF.md` 갱신이 필요하다.
