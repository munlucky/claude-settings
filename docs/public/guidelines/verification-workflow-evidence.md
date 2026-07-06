# Verification Workflow Evidence

This guideline owns workflow evidence closeout policy for `completion-verifier`.

## Required Signals

- `workflowEvidence.selectedHarnessComponents`, `skippedHarnessComponents`, `selectionReason`, `runtimeIsolation`, and `modelEffortProfile` must be populated when workflow evidence is present.
- Code-changing closeout should include review evidence, finish evidence, and concrete `QA_REPORT.md` closeout fields.
- Medium, complex, and phase work should record contract review evidence or a concrete skip reason.
- CodeReviewGraph evidence must be selected or explicitly skipped when code structure analysis was required.
- `evidenceProvenance` must identify the current-run command or artifact behind each completion-relevant claim.

## Score And Traceability

- Score verdict must be `done`; `current >= target`, `unmetChecklistItems == 0`, and `blockingDefects == 0`.
- In-scope `REQ-*` rows need implementation and verification evidence or a blocker.
- Critical `SCN-*` rows need fresh runtime, browser, generated artifact, or E2E evidence.
- Smoke-only evidence for critical scenarios is warning evidence, not clean-finish evidence.
- Browser completion result artifacts are verification-plane inputs only; runtime-state `assess-completion` remains the accepted completion authority.
- Agentic browser confirmation is a semantic review evidence layer after deterministic Playwright evidence. It cannot replace Playwright failures, mutate scenario expectations, or claim completion authority.
- Review-critique-loop receipts are semantic review evidence only. Completion claims and phase closeout must fail closed when the receipt is missing, tampered, blocking, mismatched to the candidate/source/bundle, or contaminated with raw prompts or transcripts.
- `uat_ready` and `uat_complete` are separate. Automation can establish readiness, not human completion.

## Architecture Evidence

- Architecture packages need positive fixture coverage and negative coverage for missing ASR, ADR, traceability, architecture review, raw KG/MemoryGraph leakage, and missing verification signals.
- Brownfield architecture evidence must resolve repository paths when a repo root is available.
- Architecture eval cases are regression evidence only; they do not replace runtime-state completion authority.

## Closeout Policy

- Non-empty `workflowEvidence.warnings` prevents clean `gateDecision: pass` in strict runs and must be surfaced in standard runs.
- Missing required frontend, browser, accessibility, visual, or performance backends are setup gaps when the source contract declares them.
- `QA_REPORT.md` should track review finding decisions as `accepted`, `challenged`, `deferred`, or `needs_clarification`.
- `HANDOFF.md` should contain concrete continuation steps when verification is blocked or deferred.
- Agent operating policy evidence can record retrieval, assumptions/blockers, untrusted content disposition, skill readiness, artifact routing, context relevance, and cumulative risk. It is evidence only; accepted completion authority remains with `scripts/runtime-state.mjs assess-completion`.
- This guideline is evidence policy only; accepted completion authority remains with `scripts/runtime-state.mjs assess-completion`.
