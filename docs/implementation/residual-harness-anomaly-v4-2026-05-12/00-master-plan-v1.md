# Residual Harness Anomaly Remediation v4 Master Plan

> 이 문서는 거짓 `completed/clean_complete`를 차단하고 Phase 3/4/5 상태 오염을 승인된 repair flow로만 정정하기 위한 후속 작업 패키지입니다. 기존 완료 패키지를 수정하지 않고, 남은 이상징후를 runner가 바로 실행할 수 있는 phase 단위로 내립니다.

## Source Baseline
- 사용자 제공 계획: `잔존 하네스 이상징후 개선 계획 v4` (역할: scope/priority, technical contract)
- `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md` (역할: structured evidence and Harness Change Ledger baseline)
- `docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md` (역할: current artifacts and invariant baseline)
- `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/00-master-plan-v1.md` (역할: terminal pointer and lifecycle projection baseline)
- `docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md` (역할: canonical final outcome baseline)
- `.claude/scripts/phase-closeout-finalize.mjs` (역할: only allowed completion promotion owner)
- `.claude/scripts/agent-loop-phase-state.mjs` (역할: phase status update and reconciliation surface)
- `.claude/scripts/verify-phase-closeout.mjs` (역할: closeout evidence gate)
- `.claude/scripts/verify-plan-conformance.mjs` (역할: plan conformance artifact generator/verifier)
- `.claude/scripts/verification-verdict-state.mjs` and `.claude/scripts/write-verification-verdict.py` (역할: fresh verdict identity)
- `.claude/scripts/harness-state-invariants.mjs` (역할: lifecycle and pointer invariant verifier)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.92
  ambiguityScore: 0.08
  readinessDecision: executable
```

## Objective
- `completed`와 `clean_complete` 승격을 `phase-closeout-finalize.mjs`로 단일화한다.
- `attempts.total=0` 또는 stale verdict/conformance artifact가 완료 상태로 보정되는 경로를 차단한다.
- plan conformance 결과를 phase execution artifact로 구조화하고 `sourceHash` mismatch를 stale evidence로 처리한다.
- `runLeaseId`와 `repairRunId` identity path를 분리해 repair evidence가 일반 completion verdict를 대체하지 못하게 한다.
- terminal workflow JSON의 phase pointer를 `completedPhaseNumber`/`nextPhaseNumber`로 이행하고 legacy `activePhaseNumber`를 단계적으로 degrade/hard fail한다.
- active harness run 중 `.claude/scripts/**` self-modification은 maintenance/repair identity 없이는 차단한다.
- Phase 3/4/5 상태 오염은 dry-run 진단 후 명시 승인된 repair apply로만 정정한다.

## Scope
- 포함:
  - finalizer-only completion promotion contract
  - verifier fail rules for zero-attempt completed phases and invalid completed metadata
  - structured `execution/<phase-slug>/plan-conformance-result.json`
  - fresh verdict identity guard for `runLeaseId` and `repairRunId`
  - recovered blocker classification as `success_with_warning`
  - terminal pointer migration phases and invariant tests
  - self-modification guard for active runs
  - explicit repair dry-run/apply CLI with idempotency and rollback evidence
- 제외:
  - 실제 Phase 3/4/5 상태 파일을 이 문서 작성 중 수정
  - user approval 없이 repair apply 실행
  - canonical final-complete verdict allowlist를 `success | success_with_warning` 밖으로 확장
  - downstream repository sync
  - commit/push closeout

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Completion Owner And Zero Attempt Guard | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/01-completion-owner-zero-attempt-guard-v1.md` | - |
| 02 | Structured Plan Conformance Artifact | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/02-structured-plan-conformance-artifact-v1.md` | 01 |
| 03 | Fresh Verdict Identity And Recovered Blocker Semantics | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/03-fresh-verdict-identity-recovered-blocker-v1.md` | 01, 02 |
| 04 | Terminal Pointer Migration Contract | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/04-terminal-pointer-migration-v1.md` | 01 |
| 05 | Active Run Self Modification Guard | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/05-active-run-self-modification-guard-v1.md` | 01, 04 |
| 06 | Explicit Phase State Repair Flow | `docs/implementation/residual-harness-anomaly-v4-2026-05-12/06-explicit-phase-state-repair-flow-v1.md` | 01, 02, 03, 04, 05 |

## Execution Order Notes
- Phase 01 is first because every later phase relies on finalizer-only promotion and verifier rejection of false completed states.
- Phase 02 follows Phase 01 so conformance evidence cannot promote completion by itself.
- Phase 03 follows Phase 02 because verdict freshness must include conformance artifact path/hash identity.
- Phase 04 can run after Phase 01 and should land before self-modification guard because active/terminal run detection uses workflow pointers.
- Phase 05 depends on Phase 04's active-run source contract.
- Phase 06 is last because repair apply must preserve all new gates and cannot be used to bypass them.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Completion owner is shared mutable policy. Do not parallelize. |
| wave-2 | 02, 04 | limited parallel | Disjoint if Phase 02 stays in conformance artifacts and Phase 04 stays in lifecycle/pointer invariants. |
| wave-3 | 03 | sequential | Consumes Phase 01/02 completion and evidence identity contracts. |
| wave-4 | 05 | sequential | Active-run detection must be stable before blocking script modifications. |
| wave-5 | 06 | sequential | Repair flow must respect all prior guards. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | User plan / Completion Gate Owner | Only finalizer may promote `completed/clean_complete`. | 01 | `01-completion-owner-zero-attempt-guard-v1.md` | mapped |
| REQ-1.2 | AC-02 | User plan / Reconciler no promotion | `reconcileCompletedPhases` must not auto-complete `attempts.total=0`; missing metadata becomes blocked evidence gap. | 01 | `01-completion-owner-zero-attempt-guard-v1.md` | mapped |
| REQ-1.3 | AC-03 | User plan / Verifier strict completed metadata | Completed phases require attempts, finish/handoff stage, fresh verdict, and conformance pass. | 01, 02, 03 | `01-completion-owner-zero-attempt-guard-v1.md`, `02-structured-plan-conformance-artifact-v1.md`, `03-fresh-verdict-identity-recovered-blocker-v1.md` | mapped |
| REQ-2.1 | AC-04 | User plan / Structured evidence contract | Plan conformance artifact exists at `execution/<phase-slug>/plan-conformance-result.json` with required fields. | 02 | `02-structured-plan-conformance-artifact-v1.md` | mapped |
| REQ-2.2 | AC-05 | User plan / Source hash freshness | Artifact path or `sourceHash` mismatch makes completion stale. | 02 | `02-structured-plan-conformance-artifact-v1.md` | mapped |
| REQ-3.1 | AC-06 | User plan / Fresh verdict identity | Completion verdict requires matching `runLeaseId`; repair uses only `repairRunId`. | 03 | `03-fresh-verdict-identity-recovered-blocker-v1.md` | mapped |
| REQ-3.2 | AC-07 | User plan / QA recorded verdict path | Verdict identity includes phase/doc/plan/status and QA recorded verdict path. | 03 | `03-fresh-verdict-identity-recovered-blocker-v1.md` | mapped |
| REQ-3.3 | AC-08 | User plan / Recovered blocker | Blocked outcome cannot become clean complete; recovered blockers close as warning. | 03 | `03-fresh-verdict-identity-recovered-blocker-v1.md` | mapped |
| REQ-4.1 | AC-09 | User plan / Terminal pointer migration | Terminal workflow JSON emits `completedPhaseNumber` and `nextPhaseNumber`; legacy field degrades before hard fail. | 04 | `04-terminal-pointer-migration-v1.md` | mapped |
| REQ-4.2 | AC-10 | User plan / Running pointer semantics | Running/prepared `activePhaseNumber` continues to mean current executing phase. | 04 | `04-terminal-pointer-migration-v1.md` | mapped |
| REQ-5.1 | AC-11 | User plan / Self-modification guard | Active harness run blocks `.claude/scripts/**` edits unless maintenance mode or valid repair id exists. | 05 | `05-active-run-self-modification-guard-v1.md` | mapped |
| REQ-5.2 | AC-12 | User plan / Ledger is not permission | Harness Change Ledger is evidence only, not permission. | 05 | `05-active-run-self-modification-guard-v1.md` | mapped |
| REQ-6.1 | AC-13 | User plan / Repair dry-run/apply | Implementation phase can dry-run repair only; apply requires explicit `--apply --repair-run-id`. | 06 | `06-explicit-phase-state-repair-flow-v1.md` | mapped |
| REQ-6.2 | AC-14 | User plan / Repair exactness and rollback | Apply must match dry-run changes and record before/after, rollback path, target phase. | 06 | `06-explicit-phase-state-repair-flow-v1.md` | mapped |
| REQ-6.3 | AC-15 | User plan / Phase 3/4/5 repair classification | Phase 3 recovered blocker may become warning; Phase 4/5 without fresh attempt evidence remain blocked. | 06 | `06-explicit-phase-state-repair-flow-v1.md` | mapped |
| REQ-7.1 | AC-16 | User plan / Timing warning precision | Timing warning appears only when `runnerActiveSeconds > wallClockSeconds`. | 01 | `01-completion-owner-zero-attempt-guard-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [ ] Phase 01 - Completion Owner And Zero Attempt Guard (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/01-completion-owner-zero-attempt-guard-v1.md`)
- [ ] Phase 02 - Structured Plan Conformance Artifact (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/02-structured-plan-conformance-artifact-v1.md`)
- [ ] Phase 03 - Fresh Verdict Identity And Recovered Blocker Semantics (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/03-fresh-verdict-identity-recovered-blocker-v1.md`)
- [ ] Phase 04 - Terminal Pointer Migration Contract (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/04-terminal-pointer-migration-v1.md`)
- [ ] Phase 05 - Active Run Self Modification Guard (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/05-active-run-self-modification-guard-v1.md`)
- [ ] Phase 06 - Explicit Phase State Repair Flow (`docs/implementation/residual-harness-anomaly-v4-2026-05-12/06-explicit-phase-state-repair-flow-v1.md`)

## Completion Rule
- Mark a phase checked only after its phase plan completion checklist and validation commands pass in a later implementation run.
- Do not mark completion based on source-only evidence, stale verdicts, stale conformance artifacts, or repair evidence with the wrong identity path.
- Do not run repair apply without explicit user approval or an explicit command containing `--apply --repair-run-id <id>`.
- Runtime pointer preparation is intentionally out of scope for this document-writing turn.

