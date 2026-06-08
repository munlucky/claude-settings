# Verification Workflow Evidence

이 guideline은 `completion-verifier`의 workflow evidence closeout 정책을 소유합니다.

## Required Signals

- workflow evidence가 있으면 `workflowEvidence.selectedHarnessComponents`, `skippedHarnessComponents`, `selectionReason`, `runtimeIsolation`, `modelEffortProfile`이 채워져야 합니다.
- code-changing closeout에는 review evidence, finish evidence, 구체적인 `QA_REPORT.md` closeout 필드가 필요합니다.
- medium, complex, phase work는 contract review evidence 또는 구체적인 skip reason을 기록해야 합니다.
- code structure analysis가 필요했던 작업은 CodeReviewGraph evidence를 선택하거나 명시적으로 skip해야 합니다.
- `evidenceProvenance`는 completion 관련 주장마다 current-run command 또는 artifact를 가리켜야 합니다.

## Score And Traceability

- score verdict는 `done`이어야 하며 `current >= target`, `unmetChecklistItems == 0`, `blockingDefects == 0`이어야 합니다.
- in-scope `REQ-*` row에는 implementation evidence와 verification evidence 또는 blocker가 필요합니다.
- critical `SCN-*` row에는 fresh runtime, browser, generated artifact, E2E evidence 중 하나가 필요합니다.
- critical scenario에 대한 smoke-only evidence는 warning evidence이지 clean-finish evidence가 아닙니다.
- `uat_ready`와 `uat_complete`는 분리합니다. automation은 readiness를 만들 수 있지만 human completion을 의미하지 않습니다.

## Architecture Evidence

- Architecture package에는 missing ASR, ADR, traceability, architecture review, raw KG/MemoryGraph leakage, missing verification signal에 대한 positive fixture coverage와 negative coverage가 필요합니다.
- Brownfield architecture evidence는 repo root를 사용할 수 있으면 repository path로 해석되어야 합니다.
- Architecture eval case는 regression evidence일 뿐이며 runtime-state completion authority를 대체하지 않습니다.

## Closeout Policy

- `workflowEvidence.warnings`가 비어 있지 않으면 strict run에서 clean `gateDecision: pass`를 금지하고 standard run에서도 표면화해야 합니다.
- source contract가 frontend, browser, accessibility, visual, performance backend를 요구하면 누락된 backend는 setup gap입니다.
- `QA_REPORT.md`는 review finding decision을 `accepted`, `challenged`, `deferred`, `needs_clarification`으로 추적해야 합니다.
- verification이 blocked 또는 deferred이면 `HANDOFF.md`에 구체적인 continuation step을 남겨야 합니다.
- 이 guideline은 evidence policy만 소유합니다. accepted completion authority는 `scripts/runtime-state.mjs assess-completion`이 소유합니다.
