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
- 앞 stage에서 코드 분석/리뷰/영향도 증거가 필요했던 경우 `analysisContext.codeReviewGraph`

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
- Runtime Control Plane authority:
  - `scripts/runtime-state.mjs`를 사용할 수 있으면 clean finish의 authority는 `assess-completion`이 만든 accepted runtime DB completion decision입니다.
  - `completion-verifier`는 evidence writer/collector입니다. 최신 verifier evidence를 기록하고 `assess-completion`을 요청하거나 실행할 수 있지만, chat output, `phase-status.yaml`, verdict JSON, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`만으로 최종 완료를 판단하지 않습니다.
  - runtime authority를 사용할 수 있으면 derived artifact에는 `authoritySource`, `decisionId`, `evidenceHash`, `stale` metadata를 남깁니다.
  - stale/superseded verifier evidence, active identity 누락, blocking workflow warning, 승인 없는 approval-required operation, worsened eval regression은 clean finish를 막습니다.
  - 완료 판단에 쓰는 verifier evidence는 `scripts/verification-plane.mjs record-summary --run-id <runId> --goal-id <goalId> --planes-json <json> --identity-json <json> --json`으로 기록합니다.
  - accepted completion path는 unit, package, installer, browser, security, quality plane의 최신 evidence를 요구합니다. browser 또는 security setup gap은 silent pass가 아니라 명시적 plane failure입니다.
  - `scripts/verification-plane.mjs assess-security`는 CodeQL, dependency review, Dependabot, secret scanning 상태를 소비합니다. 누락된 scan, stale scan, high/critical finding, 취약 dependency review finding, secret scanning finding은 owner-approved exception 없이는 release/accepted completion을 막습니다.
- verification contract가 있으면 그 명령과 artifact를 우선 사용합니다.
- contract가 없고 standard면 fallback 탐지를 허용합니다.
- contract가 없고 strict면 앞단의 `verification-contract-gate`가 차단해야 합니다.
- 변경 유형은 보수적으로 해석합니다.
  - `docs_only`, 대부분의 `local_policy` 작업은 audit + syntax evidence 로 닫을 수 있습니다.
  - `behavior_change` 작업은 환경이 허용되면 deterministic test 또는 verifier evidence 없이 강한 완료 판정을 내리지 않습니다.
- `SPRINT_CONTRACT.md`가 있으면 그 done check도 함께 검증합니다.
- verifier는 실행할 때마다 `QA_REPORT.md`를 갱신해야 합니다.
- verification contract가 있으면 contract의 required check에 대한 최신 증거 없이는 성공 판정을 반환하지 않습니다.
- verifier artifact에 `workflowEvidence.warnings`가 있으면 이를 stage closeout 누락 신호로 취급합니다.
- plan/execute/review에서 코드 구조 분석이 필요했다면 clean closeout 전에 `code-review-graph`가 `selectedHarnessComponents` 또는 concrete reason이 있는 `skippedHarnessComponents`에 기록되어야 합니다.
- score 기반 루프에서는 `SCORECARD.md` 또는 verifier가 계산한 score가 없으면 `gateDecision: pass`를 반환하지 않습니다.
- score 기반 루프에서는 `score.verdict == done`이 아니면 완료 통과를 반환하지 않습니다.
- 의미 평가나 consensus 판단 전에 `.claude/verification.contract.yaml`의 evaluation trigger policy를 적용합니다.
  - Mechanical check가 먼저 실행되며 authoritative source로 남습니다.
  - Semantic evaluation은 AC 모호성, scope drift, architecture/security/auth/payment risk, 반복 실패, 테스트는 통과하지만 사용자 가치가 불명확한 경우처럼 명시 trigger가 있을 때만 필요합니다.
  - Consensus evaluation은 contract 재해석, high-risk security/architecture drift, evaluator disagreement 미해결 같은 예외 상황에만 사용합니다.
  - Semantic 또는 consensus evaluation은 실패한 mechanical check를 clean finish로 바꿀 수 없습니다.
  - skipped mechanical check는 validation profile에 따릅니다. `prompt_only`/`docs_only`에서는 warning, `script_change`, `workflow_core`, `runtime_adapter`에서는 blocking입니다.
  - project verification override는 allowlist된 project-native command가 명시된 경우에만 허용합니다. 알 수 없는 executable은 clean-finish evidence가 아닙니다.
  - required browser/a11y/visual/performance QA backend는 backend matrix에 기록해야 하며, required backend 누락은 profile에 따라 blocker 또는 degraded evidence로 라우팅합니다.
- 구현 완료와 acceptance 완료를 분리합니다.
  - `taskStatus: completed`는 할당된 구현 작업이 끝났다는 의미입니다.
  - `acVerdict: pass|passed|verified|done|not_applicable`는 연결된 acceptance evidence가 충족됐다는 의미입니다.
  - 연결된 acceptance criterion의 `acVerdict`가 missing, pending, unknown, failed, blocked, rejected이면 `taskStatus: completed`라도 clean closeout을 막습니다.
  - 운영성 작업은 AC link가 없거나 명시적 `acVerdict: not_applicable`을 사용할 수 있습니다. task completion만으로 exemption을 추론하지 않습니다.
- 최신 증거 없이 성공을 암시하는 표현을 쓰지 않습니다. 금지 예시는 `should pass`, `looks good`, `likely fixed`, `seems resolved`, `done pending verification` 입니다.
- `verificationState: indeterminate`
  - standard -> `pass_with_warning`
  - strict -> `failed`

## Workflow evidence 정합 규칙
- 가능하면 `verify-changes.sh` verdict의 `workflowEvidence`를 review/finish closeout의 구조화된 기준으로 사용합니다.
- 코드 변경이 있는 bounded direct 또는 phase closeout에서는 아래를 기대합니다.
  - `selectedBundles`에 `review-bundle`
  - `selectedBundles`에 `finish-bundle`
  - clean completion 전에는 applied evidence에 `codex-review-code`
  - clean completion 전 `doc-auto-sync` evidence
  - `QA_REPORT.md`에 `Review completed: yes`
  - 코드 구조 분석 또는 review context 축소가 필요한 작업이면 `code-review-graph` selected/skipped evidence
  - `QA_REPORT.md`의 finish-closeout 필드가 placeholder가 아닌 실제 closeout 내용으로 채워짐
  - phase가 실제로 닫힐 때 seeded placeholder 대신 clean-finish `HANDOFF.md` marker가 기록됨
- `workflowEvidence.warnings`가 비어 있지 않으면:
  - strict -> `gateDecision: pass` 금지
  - standard -> remediation 또는 `pass_with_warning`로 내리고 경고를 `QA_REPORT.md`에 남깁니다.
- 코드 변경 마감인데 `stageOrder` 또는 `workflowEvidence` 자체가 비어 있으면 finish/handoff 증거가 불완전하다고 봅니다.
- 필요한 CRG stage의 `analysisContext.codeReviewGraph.stageCoverage`가 비어 있으면 warning으로 처리합니다. Verify stage에서는 새 graph를 만들지 말고 gap만 기록합니다.

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

추가 규칙:
- completion 관련 주장마다 evidence provenance 를 남깁니다.
  - command 또는 verifier 이름
  - artifact 경로
  - 이번 실행에서 생성된 증거인지 여부

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
  codeReviewGraph:
    required: true | false
    graphStatus: unknown | not_built | stale | fresh | unavailable
    selectedOrSkippedRecorded: true | false
    missingStageCoverage: []
    warnings: []
  runtimeEvidence:
    criticalScenarioDepth: smoke | open-act-mutate-persist-recover | none
    smokeOnlyCriticalScenarios: []
    evaluationTriggers:
      semanticRequired: true | false
      semanticReasons: []
      consensusRequired: true | false
      consensusReasons: []
      mechanicalStatus: passed | failed | skipped | blocked
      skippedMechanicalChecks: []
      verificationOverrideStatus: allowlisted | blocked | not_used
      qaBackendMatrix:
        browser: not_required | available | missing_required | blocked
        accessibility: not_required | available | missing_required | blocked
        visual: not_required | available | missing_required | blocked
        performance: not_required | available | missing_required | degraded | blocked
  acceptanceCriteria:
    taskStatusComplete: true | false
    linkedAcceptanceCriteria: []
    acVerdict: pass | failed | pending | unknown | not_applicable
    missingOrFailedAcVerdicts: []
  gateDecision: pass | failed | pass_with_warning
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
    fresh: true | false
    workflowEvidence:
      detected: true | false
      warnings: []
  evidenceProvenance:
    - source: "verify-changes.sh"
      artifact: ".moonshot-relay/verification-verdict-<runId>.json"
      fresh: true
qaReport:
  path: "{activeSliceDir}/QA_REPORT.md"
  updated: true | false
  reviewFindingDecisions:
    - finding: "Route shadowing on reorder endpoint"
      decision: accepted | challenged | deferred | needs_clarification
      rationale: "422를 재현하고 route order 버그로 확인해 accepted 처리."
```

## 통과 규칙
- `contractApplicable == true` 또는 `verificationMode == contract`이면 `gateDecision: pass`는 아래를 모두 만족해야 합니다.
  - `verificationState == passed`
  - `evidenceFresh == true`
  - `requiredChecks.missing`이 비어 있음
  - 코드 변경 마감이면 `verdictArtifact.workflowEvidence.warnings`가 비어 있음
  - 코드 변경 마감이면 `QA_REPORT.md`에 `Review completed: yes`
  - completion 관련 주장에 대한 `evidenceProvenance`가 채워져 있음
  - `score.verdict == done`
  - 연결된 acceptance criteria가 passing `acVerdict` evidence를 가지거나 명시적으로 `not_applicable`
  - `score.current >= score.target`
  - `score.unmetChecklistItems == 0`
  - `score.blockingDefects == 0`
  - 코드 구조 분석이 필요했다면 `code-review-graph` selected/skipped evidence가 기록되어 있음
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
- phase closeout에서는 passing verifier artifact만으로 충분하지 않습니다. `QA_REPORT.md`에 review 미완료가 남아 있거나 finish/handoff가 placeholder 품질이면 완료로 올리지 않습니다.
- review finding을 remediation 입력으로 사용하는 경우 `QA_REPORT.md`는 각 의미 있는 항목을 `accepted`, `challenged`, `deferred`, `needs_clarification` 중 하나로 추적해야 하며, 그렇지 않으면 루프를 닫지 않습니다.
- 검증 실패나 중단 시에는 다음 라운드를 위해 `HANDOFF.md` 갱신이 필요합니다.
