---
name: completion-verifier
description: 필수 검증을 실행하고, 구현을 완료로 볼 수 있을 만큼 증거가 충분한지 판단할 때 사용합니다.
context: fork
---

# Completion Verifier 스킬

finish 또는 handoff 전에 실행하는 기본 Verify stage 소유자입니다.

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
- `analysisContext.artifacts.scorecardPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.workflowEvidencePath` (있으면 사용)
- `analysisContext.artifacts.testGuidePath`
- `analysisContext.artifacts.analysisIndexPath` / `analysisRoot`
- `TEST_GUIDE.md`, `PROJECT.md` 또는 verification contract의 테스트/검증 명령
- `analysisContext.signals.allowIndeterminate`
- 최신 verifier verdict artifact
  - 특히 `verify-changes.sh`가 기록한 `verdict.workflowEvidence.*`
  - 특히 `verify-changes.sh`가 기록한 `verdict.score.*`

## contract-first 정책
검증 명령 해석 우선순위:
1. `.claude/verification.contract.yaml`
2. `TEST_GUIDE.md`
3. `PROJECT.md` Testing Rules
4. 파일시스템/스크립트 자동 감지 fallback

적용 범위 규칙:
- contract가 `scope`를 선언하면 현재 execution plane 또는 변경 경로가 그 범위에 맞을 때만 required check를 적용합니다.
- contract 파일은 존재하지만 현재 scope에 적용되지 않으면, 관련 없는 required check를 강제하지 말고 활성 워크스페이스 계약이나 fallback 감지로 내려갑니다.

검증 환경 출력은 아래 상태를 구분해야 합니다.

```yaml
verificationEnvironment:
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
```

## 핵심 규칙
- verification contract가 있으면 그 명령과 artifact를 우선 사용합니다.
- contract가 없고 standard면 fallback 탐지를 허용합니다.
- contract가 없고 strict면 앞단의 `verification-contract-gate`가 차단해야 합니다.
- `SPRINT_CONTRACT.md`가 있으면 그 done check도 함께 검증합니다.
- verifier는 실행할 때마다 `QA_REPORT.md`를 갱신해야 합니다.
- verification contract가 있으면 contract의 required check에 대한 최신 증거 없이는 성공 판정을 반환하지 않습니다.
- verifier artifact에 `workflowEvidence.warnings`가 있으면 이를 stage closeout 누락 신호로 취급합니다.
- score 기반 루프에서는 `SCORECARD.md` 또는 verifier가 계산한 score가 없으면 `gateDecision: pass`를 반환하지 않습니다.
- score 기반 루프에서는 `score.verdict == done`이 아니면 완료 통과를 반환하지 않습니다.
- `verificationState: indeterminate`
  - standard -> `pass_with_warning`
  - strict -> `failed`

## Workflow evidence 정합 규칙
- 가능하면 `verify-changes.sh` verdict의 `workflowEvidence`를 review/finish closeout의 구조화된 기준으로 사용합니다.
- 코드 변경이 있는 bounded direct 또는 phase closeout에서는 아래를 기대합니다.
  - `selectedBundles`에 `review-bundle`
  - `selectedBundles`에 `finish-bundle`
  - applied 또는 명시적 skipped evidence에 `codex-review-code`
  - clean completion 전 `doc-auto-sync` evidence
- `workflowEvidence.warnings`가 비어 있지 않으면:
  - strict -> `gateDecision: pass` 금지
  - standard -> remediation 또는 `pass_with_warning`로 내리고 경고를 `QA_REPORT.md`에 남깁니다.
- 코드 변경 마감인데 `stageOrder` 또는 `workflowEvidence` 자체가 비어 있으면 finish/handoff 증거가 불완전하다고 봅니다.

## Step 1.1: Score 정합

가능하면 최신 verifier artifact의 score를 우선 사용합니다.

1. `verify-changes.sh`가 기록한 `verdict.score.*`를 읽습니다.
2. verifier score가 없으면 `SCORECARD.md`를 읽습니다.
3. verifier가 계산한 score를 Markdown summary보다 authoritative source로 취급합니다.

score 완료 규칙:
- `score.current >= score.target`
- `score.unmetChecklistItems == 0`
- `score.blockingDefects == 0`
- `score.verdict == done`

위 조건 중 하나라도 깨지면 verify stage는 clean completion으로 닫을 수 없습니다.

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
  score:
    detected: true | false
    source: verifier_artifact | scorecard | none
    current: 100
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: done | retry | blocked | missing
  gateDecision: pass | failed | pass_with_warning
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
    fresh: true | false
    workflowEvidence:
      detected: true | false
      warnings: []
qaReport:
  path: "{activeSliceDir}/QA_REPORT.md"
  updated: true | false
```

## 통과 규칙
- `contractApplicable == true` 또는 `verificationMode == contract`이면 `gateDecision: pass`는 아래를 모두 만족해야 합니다.
  - `verificationState == passed`
  - `evidenceFresh == true`
  - `requiredChecks.missing`이 비어 있음
  - 코드 변경 마감이면 `verdictArtifact.workflowEvidence.warnings`가 비어 있음
  - `score.verdict == done`
  - `score.current >= score.target`
  - `score.unmetChecklistItems == 0`
  - `score.blockingDefects == 0`
- 그 외에는 self-audit만으로 완료 성공을 추론하지 않습니다.

추가 규칙:
- contract 파일이 있어도 현재 scope 밖이면 `verificationMode=workspace` 또는 `fallback`으로 내려가야 합니다.
- contract 적용 범위 안인데 required check를 실행하지 못하면 `gateDecision: pass`를 반환할 수 없습니다.
- score 기반 실행에서 score artifact가 없으면 `gateDecision: pass` 대상이 아닙니다.

## 메모
- Self-Audit는 테스트를 보완하는 용도이지 대체물이 아닙니다.
- verdict artifact가 최종 검증 증거가 됩니다.
- contract 기반 성공 판정에는 이번 실행에서 생성된 최신 verifier artifact 또는 동등한 명령 증거가 필요합니다.
- 있으면 `verdictArtifact.workflowEvidence`를 review/finish 단계 증거의 canonical structured hint로 사용합니다.
- 검증 실패나 중단 시에는 다음 라운드를 위해 `HANDOFF.md` 갱신이 필요합니다.
