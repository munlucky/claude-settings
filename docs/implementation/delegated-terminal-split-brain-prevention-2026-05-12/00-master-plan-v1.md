# Delegated-Terminal Split-Brain Prevention Master Plan v1

> This document turns the approved v4 design into an implementation package. It does not modify active session `019e1aa9-57bf-7a92-b099-8883eddb1fe1`, `docs/implementation/residual-harness-anomaly-v4-2026-05-12/**`, or runtime pointers.

## Source Baseline
- User-approved plan: `Delegated-Terminal 경로 이탈 및 Split-Brain 재발 방지 계획 v4` (role: scope/priority + technical contract)
- `docs/implementation/blocker-closeout-prevention-2026-05-12/00-master-plan-v1.md` (role: sidecar/manifest baseline; already completed, not reopened)
- `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md` (role: active-session exclusion and finalizer-only completion baseline)
- `.claude/scripts/agent-loop.mjs` (role: delegated-terminal outer loop, clean-finish artifact reconciliation)
- `.claude/scripts/agent-loop-phase-attempt.mjs` and `.claude/scripts/agent-loop-phase-runner.mjs` (role: phase attempt start/finish surfaces)
- `.claude/scripts/agent-loop-phase-state.mjs` (role: phase status mutation and reconciliation surface)
- `.claude/scripts/phase-closeout-finalize.mjs` and `.claude/scripts/phase-closeout-reconciler.mjs` (role: finalizer/reconciler surfaces)
- `.claude/scripts/verify-phase-closeout.mjs` and `.claude/scripts/lib/phase-closeout-verdict.mjs` (role: closeout verifier and verdict policy)
- `.claude/scripts/lib/phase-liveness-checker.mjs`, `.claude/scripts/lib/phase-run-lease-store.mjs`, and `.claude/scripts/runtime-state.mjs` (role: worker/controller liveness)
- `.claude/scripts/lib/verification-contract.mjs` and `.claude/scripts/lib/failure-classifier.mjs` (role: required verifier and alternate verifier policy)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: medium
  verificationClarity: high
  clarityScore: 0.84
  ambiguityScore: 0.16
  readinessDecision: constrained/reconcile-required
  strictRunnableReadiness: false
  evidence: "iteration 05 reviewer returned decision=revise because live verify-phase-closeout is allowed:false and current package metadata conflicts with canonical evidence."
  readinessBlockers:
    - "BF-01: active package still claimed executable/pass while live closeout verification fails."
    - "BF-02: Phase 01-07 repair routes must be explicit before runnable execution."
    - "BF-03: reconciliation transaction outputs and supersede handling must be specified."
```

## Objective
- Require canonical attempt manifest evidence from phase attempt intent through finalizer seal.
- Reject direct-pass/projection-only completion as orphan projection, not phase-runner completion.
- Restrict orphan adoption to manual reconcile mode with explicit adoption metadata and verifier re-run evidence.
- Make clean-complete recovery a resumable reconciliation transaction, not a one-shot projection rewrite.
- Split controller stale state from worker liveness using `childPid + childProcessStartTime + commandHash + attemptId`.
- Allow required verifier EPERM completion only when a declared alternate verifier passed; undeclared alternate evidence remains supporting evidence only.
- Emit timing/cache telemetry from manifest events instead of projection timestamps alone.

## Non-Goals
- Do not delete or rewrite legacy direct-pass artifacts.
- Do not modify active session `019e1aa9-57bf-7a92-b099-8883eddb1fe1` documents or runtime pointer files during this planning turn.
- Do not reopen the already completed `blocker-closeout-prevention-2026-05-12` package.
- Do not allow delegated-terminal loop auto-adoption of orphan projection artifacts.
- Do not treat runner logs, phase-status YAML, or Markdown projections as canonical completion evidence when manifest enforcement applies.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 5
  isolationMode: "user-designated-read-only"
  maxIterations: 5
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.84
  ambiguityScore: 0.16
  decision: "revise"
  strictRunnableReadiness: false
  reviewerSessions:
    - "forked-reviewer-read-only"
    - "forked-reviewer-read-only-iter-03"
    - "forked-reviewer-read-only-iter-04"
    - "isolated-reviewer-agent-iter-05"
  writerSessions:
    - "forked-writer-current-session"
    - "forked-writer-current-session-iter-03"
    - "isolated-writer-agent-iter-05"
  artifactRoot: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/planning-loop"
  latestReview: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/planning-loop/plan-quality-review-iter-05.yaml"
  latestWriterRevision: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/planning-loop/plan-writer-revision-iter-05.yaml"
  canonicalExecutionRoot: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1"
  blockingFindings:
    - "BF-01: readiness metadata stale versus live verifier failure."
    - "BF-02: phase-level repair routes required."
    - "BF-03: reconciliation transaction outputs underspecified."
  remainingImprovementDirectives: []
  remainingOpenDecisions:
    - "Strict runnable readiness remains blocked until live verify-phase-closeout returns allowed:true with zero blocking violations."
```

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Attempt Manifest Contract | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/01-attempt-manifest-contract-v1.md` | - |
| 02 | Completion Gate Canonical Enforcement | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/02-completion-gate-canonical-enforcement-v1.md` | 01 |
| 03 | Manual Orphan Reconcile Mode | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/03-manual-orphan-reconcile-mode-v1.md` | 01, 02 |
| 04 | Reconciliation Transaction Resume | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/04-reconciliation-transaction-resume-v1.md` | 02, 03 |
| 05 | Controller Worker Liveness Split | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/05-controller-worker-liveness-split-v1.md` | 01, 04 |
| 06 | Declared Alternate Verifier Policy | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/06-declared-alternate-verifier-policy-v1.md` | 02, 04, 05 |
| 07 | Manifest Event Telemetry Fixtures | `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/07-manifest-event-telemetry-fixtures-v1.md` | 01, 02, 03, 04, 05, 06 |

## Execution Order Notes
- Phase 01 must land first because later gates need `PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION = 1` and attempt identity fields.
- Phase 02 is the behavioral gate that prevents false `completed` promotion.
- Phase 03 is intentionally manual-only; it must not be wired into delegated-terminal auto-loop.
- Phase 04 makes recovery resumable before liveness and verifier warning policy depend on it.
- Phase 05 is after manifest and transaction support so stale controller state cannot be mistaken for live worker state.
- Phase 06 must consume Phase 02 completion semantics as a verdict policy extension, after Phase 05, so alternate verifier evidence cannot bypass canonical completion or liveness classification.
- Phase 07 is final regression and telemetry proof after all paths are wired.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Establishes manifest schema and attempt event writer. |
| wave-2 | 02 | sequential | Shared completion policy; do not parallelize. |
| wave-3 | 03 | sequential | Manual reconcile boundary depends on canonical rejection codes. |
| wave-4 | 04 | sequential | Reconciliation transactions touch shared status/projection surfaces. |
| wave-5 | 05 | sequential | Liveness policy reads manifest and transaction state; do not parallelize with Phase 06. |
| wave-6 | 06 | sequential | Phase 02 verdict policy extension; runs after Phase 05 to avoid shared verdict/liveness ambiguity. |
| wave-7 | 07 | sequential | End-to-end fixtures after behavior is complete. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | v4 / Attempt manifest | Define `PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION = 1`, enforcement flags, and spawn-before intent. | 01 | `01-attempt-manifest-contract-v1.md` | mapped |
| REQ-1.2 | AC-02 | v4 / Attempt manifest | Patch child identity, exit result, and finalizer seal into the manifest. | 01, 02 | `01-attempt-manifest-contract-v1.md`, `02-completion-gate-canonical-enforcement-v1.md` | mapped |
| REQ-2.1 | AC-03 | v4 / Completion gate | Completed requires manifest intent, child identity, exit patch, finalizer seal, and verifier pass. | 02 | `02-completion-gate-canonical-enforcement-v1.md` | mapped |
| REQ-2.2 | AC-04 | v4 / Completion gate | Reject runner-log-only, direct-pass-only, and phase-status-only completion as `orphan_projection_completion`. | 02 | `02-completion-gate-canonical-enforcement-v1.md` | mapped |
| REQ-3.1 | AC-05 | v4 / Manual orphan adoption | Delegated-terminal loop cannot use `--adopt-orphan`; adoption is manual reconcile only. | 03 | `03-manual-orphan-reconcile-mode-v1.md` | mapped |
| REQ-3.2 | AC-06 | v4 / Manual orphan adoption | Adoption metadata and reverification commands are required before completion. | 03 | `03-manual-orphan-reconcile-mode-v1.md` | mapped |
| REQ-4.1 | AC-07 | v4 / Reconciliation protocol | `reconciliation-intent.json` starts clean-complete recovery and resumes/retries partial reconciliation. | 04 | `04-reconciliation-transaction-resume-v1.md` | mapped |
| REQ-4.2 | AC-08 | v4 / Reconciliation protocol | All touched projections and SQLite events share one transaction id and preserve stale history. | 04 | `04-reconciliation-transaction-resume-v1.md` | mapped |
| REQ-5.1 | AC-09 | v4 / Liveness policy | `controller_stale_worker_active` requires child identity, command hash, and heartbeat attempt id match. | 05 | `05-controller-worker-liveness-split-v1.md` | mapped |
| REQ-5.2 | AC-10 | v4 / Liveness policy | Missing start time becomes `worker_liveness_unknown`; artifact progress never promotes completion. | 05 | `05-controller-worker-liveness-split-v1.md` | mapped |
| REQ-6.1 | AC-11 | v4 / Verifier policy | Required verifier EPERM plus declared alternate pass can complete with warning. | 06 | `06-declared-alternate-verifier-policy-v1.md` | mapped |
| REQ-6.2 | AC-12 | v4 / Verifier policy | Undeclared alternate verifier evidence is supporting evidence only and cannot satisfy completion. | 06 | `06-declared-alternate-verifier-policy-v1.md` | mapped |
| REQ-7.1 | AC-13 | v4 / Telemetry | Timing/cache telemetry is derived from manifest events and has regression coverage. | 07 | `07-manifest-event-telemetry-fixtures-v1.md` | mapped |
| REQ-7.2 | AC-14 | v4 / Legacy cutoff | Legacy artifacts without `schemaVersion` and `manifestRequired` can be grandfathered only when they match the pre-enforcement legacy artifact contract; post-enforcement projection-only states are rejected as orphan projection. | 07 | `07-manifest-event-telemetry-fixtures-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [ ] Phase 01 - Attempt Manifest Contract (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/01-attempt-manifest-contract-v1.md`) - reconcile-required
- [ ] Phase 02 - Completion Gate Canonical Enforcement (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/02-completion-gate-canonical-enforcement-v1.md`) - reconcile-required
- [ ] Phase 03 - Manual Orphan Reconcile Mode (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/03-manual-orphan-reconcile-mode-v1.md`) - reconcile-required
- [ ] Phase 04 - Reconciliation Transaction Resume (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/04-reconciliation-transaction-resume-v1.md`) - reconcile-required
- [ ] Phase 05 - Controller Worker Liveness Split (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/05-controller-worker-liveness-split-v1.md`) - reconcile-required
- [ ] Phase 06 - Declared Alternate Verifier Policy (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/06-declared-alternate-verifier-policy-v1.md`) - reconcile-required
- [ ] Phase 07 - Manifest Event Telemetry Fixtures (`docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/07-manifest-event-telemetry-fixtures-v1.md`) - reconcile-required

## Phase 01-07 Repair Routes
| Phase | Current blocking failures | Selected repair route | Allowed mutations | Expected evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| 01 | `completed-timing-stage-not-terminal`, `plan-conformance-not-passed`, `incomplete_attempt_manifest` | fresh no-op canonical attempt + conformance replay | plan/evidence artifacts only | new manifest intent/child/exit/finalizer seal, terminal timing, passing conformance | source change needed -> `blocked_requires_source_change` |
| 02 | `master-checklist-not-checked`, `completed-timing-stage-not-terminal`, `plan-conformance-not-passed`, `incomplete_attempt_manifest` | fresh no-op canonical attempt + checklist after evidence | plan/evidence artifacts only | canonical manifest, terminal timing, passing conformance, checklist checked after pass | evidence missing -> incomplete |
| 03 | Phase 02 failures plus `artifact_path_missing` for `SCN-03-*` | fresh no-op canonical attempt + evidence-only scenario replay | plan/evidence artifacts only | canonical manifest, passing `SCN-03-*`, passing conformance | scenario cannot replay without code change -> blocker |
| 04 | Phase 02 failures plus `artifact_path_missing` for `SCN-04-*` | fresh no-op canonical attempt + evidence-only transaction replay | plan/evidence artifacts only | canonical manifest, passing `SCN-04-*`, transaction evidence, passing conformance | transaction evidence cannot replay -> blocker |
| 05 | `master-checklist-not-checked`, `completed-timing-stage-not-terminal`, `plan-conformance-not-passed`, `atomic-tasks-incomplete`, `verification-verdict-inconsistent`, `verification-verdict-not-passed`, `incomplete_attempt_manifest` | fresh no-op canonical attempt + verifier verdict replay | plan/evidence artifacts only | canonical manifest, terminal timing, passing verdict, WORKSETS complete, passing conformance | source mutation required -> `blocked_requires_source_change` |
| 06 | `plan-conformance-not-passed` | evidence-only conformance replay | plan/evidence artifacts only | fresh passing conformance verdict | replay fails -> incomplete |
| 07 | `completed-timing-stage-not-terminal`, `plan-conformance-not-passed` | fresh no-op canonical attempt + conformance replay | plan/evidence artifacts only | canonical manifest, terminal timing, passing conformance | latest dispatch remains failed without supersede -> incomplete |

## Reconciliation Transaction Artifacts
- Transaction root: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/reconciliation/<transactionId>/`.
- Required artifacts:
  - `reconciliation-intent.json`
  - `reconciliation-partial.json` when interrupted before success
  - `reconciliation-success.json` only after final live verifier returns `allowed:true`
  - `touched-projections.json`
  - `historical-warnings.jsonl`
- Required fields:
  - `transactionId`
  - `mode: manual_reconciliation`
  - `sourceMutationAllowed: false`
  - `originalStopReasonCode`
  - `originalStopReasonDetail`
  - `supersededByTransactionId`
  - `reconciledAt`
  - `reconciliationReason`
  - `historicalWarnings`
  - `degradedEvidence`
- Touched projection list must include planned handling for `.claude/docs/phase-status.yaml`, `.claude/logs/workflow-enforcement/current-run.json`, `.claude/logs/workflow-enforcement/active-phase-run.json`, `.claude/logs/workflow-enforcement/latest-dispatch.json`, and this master plan.
- `latest-dispatch.json` failed + completed phase-status conflict is superseded historical evidence only. It must not be deleted and must not count as normal completion evidence.
- MemoryGraph unavailable is `degradedEvidence` only. It cannot block completion and cannot prove completion.

## Preparation Status
- This package is `constrained/reconcile-required`, not strict-runnable.
- Iteration 05 downgraded readiness because live `verify-phase-closeout.mjs` returns `allowed:false` against the current package.
- Track A applies to new attempts and future completions only; it must not block the explicit manual reconciliation transaction for current legacy projections.
- Track B is source-mutation prohibited. If evidence replay requires source edits, stop that phase as `blocked_requires_source_change`.
- Runtime pointer preparation and archive/rewrite actions remain execution-time work; this writer revision only updates the active plan package.

## Completion Rule
- Do not relax `verify-phase-closeout.mjs`.
- A phase can be checked only after canonical manifest evidence, terminal timing, conformance evidence, scenario/verdict evidence, and the phase checklist all pass.
- Track B cannot modify source code, scripts, runtime state, or verification baselines.
- Manual reconciliation can supersede failed historical projections only through a `reconciliation-intent.json` transaction.
- Final acceptance requires the live verifier to return `allowed:true` with zero blocking violations.
- Baseline violations expected to clear: `completed-timing-stage-not-terminal`, `plan-conformance-not-passed`, `incomplete_attempt_manifest`, `master-checklist-not-checked`, `artifact_path_missing`, `atomic-tasks-incomplete`, `verification-verdict-inconsistent`, `verification-verdict-not-passed`, `latest-dispatch-failed-phase-completed`.
