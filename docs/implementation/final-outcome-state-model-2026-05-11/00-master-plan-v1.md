# Final Outcome State Model Master Plan v1

> 이 문서는 `Final Outcome 상태 모델 정리 계획 v8`을 실행 가능한 phase 작업문서로 내린 상위 계획입니다.

## Source Baseline
- 사용자 제공 계획: `Final Outcome 상태 모델 정리 계획 v8` (역할: scope/priority, technical contract)
- `docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md` (역할: 선행 current-artifacts/publish invariant)
- `docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md` (역할: 선행 closeout consistency contract)
- `.claude/docs/phase-status.yaml` (역할: 현재 defect 재현 입력; 작업문서 작성 중 수정 금지)
- `.claude/scripts/phase-closeout-finalize.mjs` (역할: finalizer and publish entrypoint)
- `.claude/scripts/verification-verdict-state.mjs` (역할: canonical/current verdict reader)
- `.claude/scripts/verify-phase-closeout.mjs` (역할: closeout verifier)
- `.claude/scripts/workflow-enforcement.mjs` (역할: workflow JSON projection)
- `.claude/scripts/agent-loop-phase-state.mjs` (역할: phase-status root writer)
- `.claude/scripts/agent-loop-phase-artifacts.mjs` (역할: summary/current artifact projection)
- `.claude/scripts/phase-final-git-closeout.mjs` (역할: repository closeout gate)
- `.claude/scripts/verify-phase-runtime-parity.mjs` and `.claude/scripts/verify-phase-runtime-parity.sh` (역할: runtime parity harness)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.93
  ambiguityScore: 0.07
  readinessDecision: executable
```

## Objective
- 완료된 run에서 final outcome, active blocker, historical warning, projection freshness, repository closeout을 분리한다.
- `complete` legacy 입력은 허용하되 canonical output은 `success | success_with_warning`으로 정규화한다.
- 이미 canonical final complete 상태에서는 finalizer가 strict no-diff 대상 파일을 다시 쓰지 않게 한다.
- summary projection과 runtime parity classifier를 source mutation 없는 순수 projection/순수 classifier 계층으로 분리한다.

## Scope
- 포함:
  - `projectionSchemaVersion`, `finalOutcomeSchemaVersion`, `summaryProjectionSchemaVersion` marker 추가
  - canonical final complete predicate와 canonical no-op predicate 분리
  - recovered blocker fingerprint/dedupe 및 historical warning projection 정리
  - read-only summary projection library 추가
  - finalizer result의 `plannedWrites`, `publishWrites`, `skippedWrites`, `idempotentNoop` visibility
  - runtime closeout과 repository closeout exit-code 분리
  - runtime parity pure classifier와 optional/required profile 분리
- 제외:
  - 새 phase runner 도입
  - `.claude/runtime-state.sqlite` schema 전면 재설계
  - 기존 current-artifacts manifest/publish protocol 재설계
  - append-only diagnostics/event/runtime log strict no-diff 보장
  - downstream repository sync

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Canonical Final Outcome And No-op Predicate | `docs/implementation/final-outcome-state-model-2026-05-11/01-canonical-final-outcome-noop-v1.md` | - |
| 02 | Recovered Blocker And Workflow Warning Projection | `docs/implementation/final-outcome-state-model-2026-05-11/02-recovered-blocker-workflow-warning-v1.md` | 01 |
| 03 | Summary Projection Schema And Read-only Writer | `docs/implementation/final-outcome-state-model-2026-05-11/03-summary-projection-schema-v1.md` | 01, 02 |
| 04 | Finalizer Result And Repository Closeout Split | `docs/implementation/final-outcome-state-model-2026-05-11/04-finalizer-result-repository-closeout-v1.md` | 01, 02, 03 |
| 05 | Runtime Parity Pure Classifier | `docs/implementation/final-outcome-state-model-2026-05-11/05-runtime-parity-classifier-v1.md` | - |

## Execution Order Notes
- Phase 01 is the mandatory first slice. It defines final-complete vs canonical no-op and prevents legacy `complete` from being treated as no-write canonical state.
- Phase 02 must follow Phase 01 because recovered blocker and warning history determine `success_with_warning`.
- Phase 03 depends on Phase 01/02 so summary status can distinguish completed runtime, historical warnings, and active failures.
- Phase 04 closes result shape and exit-code semantics after state and summary projections are stable.
- Phase 05 is mostly independent and can run in parallel only if it does not modify shared finalizer/verifier files.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Shared finalizer/status predicates must be stable first. |
| wave-2 | 02 | sequential | Touches workflow and finalizer warning projection. |
| wave-2b | 05 | limited parallel | Allowed only if owned paths stay in runtime parity scripts/lib/tests. |
| wave-3 | 03 | sequential | Summary must consume finalized outcome/warning shape read-only. |
| wave-4 | 04 | sequential | Result/exit-code contract depends on prior projection semantics. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | Plan v8 / Schema marker | Add `projectionSchemaVersion`, `finalOutcomeSchemaVersion`, and `summaryProjectionSchemaVersion`. | 01, 03 | `01-canonical-final-outcome-noop-v1.md`, `03-summary-projection-schema-v1.md` | mapped |
| REQ-1.2 | AC-02 | Plan v8 / Canonical State Contract | Accept legacy `complete`, output `success | success_with_warning`, `finalVerdict: complete`, `scope_complete`, `clean_complete`. | 01 | `01-canonical-final-outcome-noop-v1.md` | mapped |
| REQ-1.3 | AC-03 | Plan v8 / Canonical no-op | Split final-complete predicate from canonical no-op predicate and force rewrite when schema/hash markers are stale. | 01 | `01-canonical-final-outcome-noop-v1.md` | mapped |
| REQ-1.4 | AC-04 | Plan v8 / Idempotence scope | Strict no-diff only covers phase-status, workflow JSON, latest dispatch, and summary projection. | 01, 04 | `01-canonical-final-outcome-noop-v1.md`, `04-finalizer-result-repository-closeout-v1.md` | mapped |
| REQ-1.5 | AC-05 | Plan v8 / Recovered blocker handling | Empty/clean active blocker fields do not create recovered blockers; stale blockers dedupe by normalized fingerprint. | 02 | `02-recovered-blocker-workflow-warning-v1.md` | mapped |
| REQ-1.6 | AC-06 | Plan v8 / Workflow state projection | Completion vocabulary is excluded from warning candidates; real historical failures remain `nonBlockingWarnings[]` and `attemptHistory[]`. | 02 | `02-recovered-blocker-workflow-warning-v1.md` | mapped |
| REQ-1.7 | AC-07 | Plan v8 / Summary projection | Add read-only `phase-summary-projection.mjs`; completed runtime shows `Completed N / Failed 0 / State completed` even with historical warnings or repository pending. | 03 | `03-summary-projection-schema-v1.md` | mapped |
| REQ-1.8 | AC-08 | Plan v8 / Finalizer result | Default `finalize` returns exit 0 on runtime closeout success even with dirty repository; strict closeout exits 2. | 04 | `04-finalizer-result-repository-closeout-v1.md` | mapped |
| REQ-1.9 | AC-09 | Plan v8 / Write visibility | Result includes `plannedWrites`, `publishWrites`, and `skippedWrites`; no-op includes `idempotentNoop:true`. | 04 | `04-finalizer-result-repository-closeout-v1.md` | mapped |
| REQ-1.10 | AC-10 | Plan v8 / Runtime parity | Add pure classifier; shell parsing stays in normalization layer; `--runtime-profile` overrides `PHASE_RUNTIME_PROFILE`. | 05 | `05-runtime-parity-classifier-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Canonical Final Outcome And No-op Predicate (`docs/implementation/final-outcome-state-model-2026-05-11/01-canonical-final-outcome-noop-v1.md`)
- [x] Phase 02 - Recovered Blocker And Workflow Warning Projection (`docs/implementation/final-outcome-state-model-2026-05-11/02-recovered-blocker-workflow-warning-v1.md`)
- [x] Phase 03 - Summary Projection Schema And Read-only Writer (`docs/implementation/final-outcome-state-model-2026-05-11/03-summary-projection-schema-v1.md`)
- [x] Phase 04 - Finalizer Result And Repository Closeout Split (`docs/implementation/final-outcome-state-model-2026-05-11/04-finalizer-result-repository-closeout-v1.md`)
- [x] Phase 05 - Runtime Parity Pure Classifier (`docs/implementation/final-outcome-state-model-2026-05-11/05-runtime-parity-classifier-v1.md`)

## Completion Rule
- Mark a phase checked only when its phase plan completion criteria and verification commands pass.
- Do not treat repository dirty/pending as runtime failure; route it only through repository closeout status.
- Do not declare full completion until strict no-diff idempotence and full test commands pass.
- Runtime pointer preparation is intentionally out of scope for this document-writing turn.
