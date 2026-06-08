---
name: completion-verifier
description: Run required checks and decide whether implementation has enough evidence to be treated as complete.
context: fork
---

# Completion Verifier Skill

completion-verifier는 Verify 단계의 assembler입니다. 최신 증거를 모으고, 필요한 검증을 실행하거나 요청하고, 가능한 경우 구조화된 verification evidence를 기록한 뒤 안정된 output shape를 반환합니다. 완료 authority 정책 자체는 이 프롬프트가 소유하지 않습니다.

## Owner Map

세부 규칙은 아래 owner를 따릅니다.

| 영역 | Owner |
|------|-------|
| runtime completion authority | `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs` |
| verification planes와 summary projection | `scripts/verification-plane.mjs`, `scripts/lib/verification-plane.mjs` |
| active verification contract | `schemas/verification.contract.yaml` |
| verification profile guideline | `docs/public/guidelines/verification-contract.md` |
| workflow evidence closeout | `docs/public/guidelines/verification-workflow-evidence.md` |
| product acceptance policy | `docs/public/guidelines/product-acceptance-gate.md` |

## Inputs

- `analysisContext.*`
- `context.md`
- `analysisContext.artifacts.sprintContractPath`
- `analysisContext.artifacts.qaReportPath`
- `analysisContext.artifacts.handoffPath`
- `analysisContext.artifacts.scorecardPath`
- `analysisContext.artifacts.requirementsTraceabilityPath`
- `analysisContext.artifacts.scenarioMatrixPath`
- `analysisContext.artifacts.uatChecklistPath`
- `analysisContext.artifacts.verificationContractPath`
- `analysisContext.artifacts.workflowEvidencePath`
- 최신 verifier verdict artifact와 current-run command output

## Non-Negotiables

- chat output, `phase-status.yaml`, verifier JSON, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, `taskLocalCompletion`, `wholePlanAuthority`, `compactStatus.latestVerificationEvidence`만으로 accepted completion authority를 만들지 않습니다.
- authority가 가능하면 clean finish에는 `scripts/runtime-state.mjs assess-completion`의 runtime-state DB decision이 필요합니다.
- `taskLocalCompletion`은 profile-scoped evidence completeness입니다.
- `wholePlanAuthority`는 evidence eligibility일 뿐이며, accepted completion에는 runtime-state DB decision이 여전히 필요합니다.
- `profileRequiredPlanes`와 `--required-planes-json`는 summary scope control일 뿐이고 `completionAuthorityRequiredPlanes`를 약화하지 않습니다.
- output key `completionStatus`, `gateDecision`, `workflowEvidence`, `evidenceProvenance`, `qaReport`를 유지합니다.
- workflow evidence warning, missing required check, stale evidence, missing identity, worsened eval, unresolved blocker, missing score, missing traceability, required frontend/setup gap이 있으면 `gateDecision: pass`를 반환하지 않습니다.

## Flow

1. `schemas/verification.contract.yaml` 또는 전달된 contract artifact에서 active verification contract를 확인합니다.
2. contract, `TEST_GUIDE.md`, project docs, fallback detection 순서로 profile과 required checks를 정합니다.
3. scope에 맞는 executable checks를 실행하고 completion 관련 주장마다 provenance를 기록합니다.
4. verification plane evidence가 있으면 `scripts/verification-plane.mjs record-summary --json`으로 기록합니다.
5. `docs/public/guidelines/verification-workflow-evidence.md`에 따라 score, traceability, scenario, UAT, workflow evidence, QA report 상태를 읽습니다.
6. whole-plan completion authority가 필요하고 가능하면 `scripts/runtime-state.mjs assess-completion --json`을 실행하거나 요청합니다.
7. 아래 output shape를 반환합니다. clean pass를 추론하지 말고 `failed` 또는 `pass_with_warning`으로 낮춥니다.

## Output Shape

```yaml
completionStatus:
  testEnvironment: true | false
  contractDetected: true | false
  contractApplicable: true | false
  verificationMode: contract | workspace | fallback
  verificationState: passed | failed | indeterminate
  evidenceFresh: true | false
  requiredChecks:
    declared: []
    executed: []
    missing: []
  score:
    detected: true | false
    source: verifier_artifact | scorecard | none
    current: 0
    target: 100
    unmetChecklistItems: 0
    blockingDefects: 0
    verdict: done | retry | blocked | missing
  traceability:
    uncoveredRequirements: []
    scenariosMissingEvidence: []
    uatReady: true | false
    uatComplete: true | false
  taskLocalCompletion:
    status: complete | blocked | missing
  wholePlanAuthority:
    status: evidence_eligible | blocked | missing
    acceptedCompletionRequired: true
  gateDecision: pass | failed | pass_with_warning
workflowEvidence:
  detected: true | false
  selectedHarnessComponents: []
  skippedHarnessComponents: []
  warnings: []
evidenceProvenance:
  - source: ""
    artifact: ""
    fresh: true | false
qaReport:
  path: ""
  updated: true | false
  reviewFindingDecisions: []
```

## Passing Rule

`gateDecision: pass`는 applicable check가 fresh이고, required checks가 충족되고, workflow evidence에 blocking warning이 없고, score verdict가 `done`이며, linked acceptance criteria가 pass 또는 명시적 `not_applicable`이고, critical scenario evidence가 fresh이며, user-facing finish claim의 UAT가 ready이고, 필요한 경우 accepted runtime-state completion authority가 있을 때만 가능합니다.

## Failure And Handoff

- 구체적인 blocker 또는 missing evidence를 기록합니다.
- 가능하면 `QA_REPORT.md`를 갱신합니다.
- `uat_ready`와 `uat_complete`를 분리합니다.
- success-by-implication 표현 없이 retry 또는 handoff guidance를 반환합니다.
- resumed closeout을 막아야 하는 review reject나 eval regression은 runtime-state owner로 기록합니다.
