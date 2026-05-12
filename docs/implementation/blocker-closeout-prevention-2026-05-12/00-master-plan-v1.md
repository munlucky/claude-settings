# Blocker Closeout Prevention Master Plan v1

> This document is the plan of all plans for implementing the approved Blocker Closeout prevention design without touching the currently active `residual-harness-anomaly-v4-2026-05-12` workstream.

## Source Baseline
- User-approved plan: `Blocker Closeout 재발 방지 구현 계획 v8` (role: scope/priority + technical contract)
- Active runtime pointer inspection on 2026-05-12 (role: exclusion boundary; active package is `docs/implementation/residual-harness-anomaly-v4-2026-05-12`)
- `.claude/scripts/runtime-state.mjs` (role: SQLite lease heartbeat source)
- `.claude/scripts/lib/phase-run-lease-store.mjs` (role: current-run/active-run lease mirror)
- `.claude/scripts/lib/lifecycle-projection-writer.mjs` (role: lifecycle projection writer)
- `.claude/scripts/phase-closeout-finalize.mjs` (role: closeout reconciliation)
- `.claude/scripts/harness-state-invariants.mjs` and `.claude/scripts/lib/harness-state-invariants.mjs` (role: invariant state classification)
- `.claude/scripts/lib/final-outcome-projection.mjs` (role: final-complete projection classifier)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.94
  ambiguityScore: 0.06
  readinessDecision: executable
```

## Objective
- Prevent terminal `blocked` outcomes from being weakened to `running`, `completed`, or generic `deferred_verification`.
- Make `BLOCKER_EVIDENCE.jsonl`, `ATTEMPT_LEDGER.jsonl`, and `projection-manifest.json` the canonical source when any sidecar/manifest exists.
- Preserve legacy verification behavior only when both sidecar and manifest are absent.
- Keep active session `019e1aa9-57bf-7a92-b099-8883eddb1fe1` documents and runtime pointers untouched.

## Non-Goals
- Do not modify `docs/implementation/residual-harness-anomaly-v4-2026-05-12/**`.
- Do not rewrite `.claude/docs/phase-status.yaml` or workflow-enforcement runtime pointers while writing this package.
- Do not introduce DB schema migration unless event JSON payload storage is insufficient during implementation.
- Do not expand canonical final-complete verdicts beyond `success | success_with_warning`.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Phase Execution Paths And Sidecar Reader | `docs/implementation/blocker-closeout-prevention-2026-05-12/01-phase-execution-paths-sidecar-reader-v1.md` | - |
| 02 | Invariant Precedence And Legacy Mode | `docs/implementation/blocker-closeout-prevention-2026-05-12/02-invariant-precedence-legacy-mode-v1.md` | 01 |
| 03 | Lifecycle Attempt Identity Guard | `docs/implementation/blocker-closeout-prevention-2026-05-12/03-lifecycle-attempt-identity-guard-v1.md` | 01, 02 |
| 04 | Terminal Blocker Publisher | `docs/implementation/blocker-closeout-prevention-2026-05-12/04-terminal-blocker-publisher-v1.md` | 03 |
| 05 | Lease And Runtime Heartbeat Hardening | `docs/implementation/blocker-closeout-prevention-2026-05-12/05-lease-runtime-heartbeat-hardening-v1.md` | 03, 04 |
| 06 | Artifact Projection From Sidecar | `docs/implementation/blocker-closeout-prevention-2026-05-12/06-artifact-projection-sidecar-v1.md` | 01, 04 |
| 07 | Verifier And Final Outcome Adoption | `docs/implementation/blocker-closeout-prevention-2026-05-12/07-verifier-final-outcome-adoption-v1.md` | 01, 02, 04, 06 |
| 08 | End-To-End Regression Fixtures | `docs/implementation/blocker-closeout-prevention-2026-05-12/08-end-to-end-regression-fixtures-v1.md` | 02, 03, 04, 05, 06, 07 |

## Execution Order Notes
- Phase 01 is the first vertical slice and must not modify active runtime pointers.
- Phase 02 must land before lifecycle writer enforcement so state classification is stable.
- Phase 03 combines writer guard and callsite `attemptId` wiring in one slice to avoid breaking existing runtime events.
- Phase 04 introduces `terminal_blocked_published`; no `lease_blocked` event is allowed.
- Phase 05 removes heartbeat/mirror contamination after the publisher contract exists.
- Phase 07 is sequential because verifier/final-outcome logic must consume the stable sidecar contract.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Establishes resolver and canonical mode detection. |
| wave-2 | 02 | sequential | State precedence affects all later checks. |
| wave-3 | 03 | sequential | Guard and callsite wiring must ship together. |
| wave-4 | 04, 06 | limited parallel | Possible only if Phase 04 owns publisher and Phase 06 owns renderer wiring after reader API is stable. |
| wave-5 | 05, 07 | sequential preferred | Shared lifecycle and verifier behavior; avoid split-brain during integration. |
| wave-6 | 08 | sequential | Full regression package after all behavior is wired. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | v8 / Slice 1 | Add phase execution resolver, sidecar/manifest reader, and legacy mode detection. | 01 | `01-phase-execution-paths-sidecar-reader-v1.md` | mapped |
| REQ-1.2 | AC-02 | v8 / Core Contract | Sidecar or manifest presence forces sidecar canonical mode; both absent allows legacy mode. | 01, 07 | `01-phase-execution-paths-sidecar-reader-v1.md`, `07-verifier-final-outcome-adoption-v1.md` | mapped |
| REQ-2.1 | AC-03 | v8 / Core Contract | Open blocker is computed by latest record per `id`, not by raw record existence. | 01, 07 | `01-phase-execution-paths-sidecar-reader-v1.md`, `07-verifier-final-outcome-adoption-v1.md` | mapped |
| REQ-3.1 | AC-04 | v8 / State Precedence | Blocked terminal classification uses `attemptOutcome -> completionStatus -> activeExecutionStatus -> status`. | 02 | `02-invariant-precedence-legacy-mode-v1.md` | mapped |
| REQ-4.1 | AC-05 | v8 / Lifecycle | `terminal_blocked_published` is the only blocked terminal lifecycle event. | 03, 04 | `03-lifecycle-attempt-identity-guard-v1.md`, `04-terminal-blocker-publisher-v1.md` | mapped |
| REQ-4.2 | AC-06 | v8 / Lifecycle | Attempt-scoped events require `attemptId`; guard and callsite wiring land together. | 03 | `03-lifecycle-attempt-identity-guard-v1.md` | mapped |
| REQ-5.1 | AC-07 | v8 / Publisher | Publisher is idempotent by `blockerEvidence.id` and `attemptId + transactionId`. | 04 | `04-terminal-blocker-publisher-v1.md` | mapped |
| REQ-5.2 | AC-08 | v8 / Manifest | Manifest records hashes, IDs, terminal outcome, transaction identity, and detects partial publish. | 04, 07 | `04-terminal-blocker-publisher-v1.md`, `07-verifier-final-outcome-adoption-v1.md` | mapped |
| REQ-6.1 | AC-09 | v8 / Lease Runtime | Lease mirror and runtime heartbeat never overwrite terminal `completion_status` or blocker metadata. | 05 | `05-lease-runtime-heartbeat-hardening-v1.md` | mapped |
| REQ-7.1 | AC-10 | v8 / Artifact Projection | QA/HANDOFF/SCORECARD are rendered projections, not blocker truth sources. | 06 | `06-artifact-projection-sidecar-v1.md` | mapped |
| REQ-8.1 | AC-11 | v8 / Finalizer | Open/regressed blocker or manifest mismatch prevents completed/superseded reconciliation. | 07 | `07-verifier-final-outcome-adoption-v1.md` | mapped |
| REQ-9.1 | AC-12 | v8 / E2E | Regression fixtures cover heartbeat, finalize, remediation, split-brain, and legacy compatibility. | 08 | `08-end-to-end-regression-fixtures-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Phase Execution Paths And Sidecar Reader (`docs/implementation/blocker-closeout-prevention-2026-05-12/01-phase-execution-paths-sidecar-reader-v1.md`)
- [x] Phase 02 - Invariant Precedence And Legacy Mode (`docs/implementation/blocker-closeout-prevention-2026-05-12/02-invariant-precedence-legacy-mode-v1.md`)
- [x] Phase 03 - Lifecycle Attempt Identity Guard (`docs/implementation/blocker-closeout-prevention-2026-05-12/03-lifecycle-attempt-identity-guard-v1.md`)
- [x] Phase 04 - Terminal Blocker Publisher (`docs/implementation/blocker-closeout-prevention-2026-05-12/04-terminal-blocker-publisher-v1.md`)
- [x] Phase 05 - Lease And Runtime Heartbeat Hardening (`docs/implementation/blocker-closeout-prevention-2026-05-12/05-lease-runtime-heartbeat-hardening-v1.md`)
- [x] Phase 06 - Artifact Projection From Sidecar (`docs/implementation/blocker-closeout-prevention-2026-05-12/06-artifact-projection-sidecar-v1.md`)
- [x] Phase 07 - Verifier And Final Outcome Adoption (`docs/implementation/blocker-closeout-prevention-2026-05-12/07-verifier-final-outcome-adoption-v1.md`)
- [x] Phase 08 - End-To-End Regression Fixtures (`docs/implementation/blocker-closeout-prevention-2026-05-12/08-end-to-end-regression-fixtures-v1.md`)

## Preparation Status
- This package is documentation-only until the user explicitly asks to prepare or run it.
- Active runtime state currently points at `docs/implementation/residual-harness-anomaly-v4-2026-05-12`; this package intentionally does not change that pointer.
- Runnable preparation must start with `prepare-implementation-plan-state.mjs --dry-run` and must archive stale runtime surfaces before dispatch.

## Completion Rule
- Mark a phase as checked only when its phase completion criteria and verification commands pass.
- Do not mark the overall plan complete while any checklist item remains unchecked.
- Do not treat legacy verifier success as sufficient when sidecar or manifest exists.
