# Harness Lifecycle Projection Hardening Master Plan v1

> 이 문서는 workflow lifecycle projection writer, pointer invariant, dispatch status schema, blocker terminal taxonomy, PID namespace 계약을 후속 `moonshot-phase-runner`가 바로 구현할 수 있도록 내린 문서 계획 패키지입니다.

## Source Baseline
- 사용자 제공 계획: `Harness Lifecycle Projection Hardening 계획 패키지 작성` (역할: scope/priority, technical contract)
- ENG Review pass/conditional pass 기록 (역할: architecture readiness, required change closure)
- `docs/implementation/final-outcome-state-model-2026-05-11/00-master-plan-v1.md` (역할: canonical final outcome baseline; `success | success_with_warning` 계약)
- `.claude/scripts/lib/final-outcome-projection.mjs` (역할: canonical run verdict allowlist)
- `.claude/scripts/lib/phase-run-lease-store.mjs` (역할: current-run/active-run lease projection writer)
- `.claude/scripts/moonshot-phase-dispatch.mjs` (역할: latest-dispatch writer and dispatch lifecycle)
- `.claude/scripts/phase-closeout-finalize.mjs` (역할: terminal workflow projection and closeout finalizer)
- `.claude/scripts/harness-state-invariants.mjs` (역할: workflow/phase-status invariant verifier)

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.90
  ambiguityScore: 0.10
  readinessDecision: executable
```

## Objective
- 기존 direct lifecycle writers를 새 네 번째 writer로 늘리지 않고 `lib/lifecycle-projection-writer.mjs` primary writer 계약으로 수렴시킨다.
- `running/prepared`와 terminal workflow state의 phase pointer invariant를 분리해 closeout 직후 next active pointer false positive를 제거한다.
- `latest-dispatch.status` 기존 vocabulary를 보존하고 신규 lifecycle detail은 별도 field로 둔다.
- blocker terminal projection을 clean/recovered/unrecovered로 고정하되 canonical final-complete verdict 계약과 충돌하지 않게 한다.
- Windows/WSL/node parent PID namespace를 명시해 stale child liveness false positive를 막는다.

## Scope
- 포함:
  - `recordLifecycleTransition(event)` schema and ownership contract
  - existing direct writer caller/event mapping
  - running/prepared vs terminal phase pointer invariant matrix
  - `latest-dispatch.status` compatibility enum and lifecycle detail fields
  - clean/recovered/unrecovered blocker terminal taxonomy
  - PID namespace and liveness evidence compatibility contract
  - plan-level QA report and Harness Change Ledger anchor
- 제외:
  - 실제 `.mjs` 구현 변경
  - `lib/lifecycle-projection-writer.mjs` 파일 생성
  - direct writer 제거
  - invariant/dispatcher/finalizer 테스트 파일 수정
  - canonical final outcome verdict allowlist 확장
  - runtime pointer preparation or phase-runner dispatch

## Review Mapping
| Review Requirement | AC ID | Phase | Plan File | Resolution |
|--------------------|-------|-------|-----------|------------|
| Writer ownership: 기존 direct writer를 네 번째 writer가 아니라 primary writer 호출자로 수렴한다. | AC-01 | 01 | `01-lifecycle-projection-writer-contract-v1.md` | `lib/lifecycle-projection-writer.mjs` primary writer, caller/event table, removal order documented. |
| Running vs terminal pointer invariant: terminal workflow phase가 next active phase와 달라도 false positive를 내지 않는다. | AC-02 | 02 | `02-pointer-invariant-contract-v1.md` | running/prepared and terminal state matrices are separate. |
| `latest-dispatch` status compatibility: existing status enum remains stable and lifecycle detail moves to separate fields. | AC-03 | 03 | `03-dispatch-lifecycle-contract-v1.md` | `status` enum and `lifecycleEvent`/`dispatchStage` fields are fixed separately. |
| Blocker taxonomy and final outcome compatibility: unrecovered blocker must not become canonical `normalizedRunVerdict=blocked`. | AC-04 | 04 | `04-closeout-recovery-taxonomy-v1.md` | unrecovered blocker is terminal but not final-complete; canonical complete remains `success | success_with_warning`. |
| Windows/WSL PID namespace: PID mismatch must not become stale child false positive. | AC-05 | 05 | `05-pid-liveness-contract-v1.md` | `pidNamespace` is required; namespace mismatch maps to degraded evidence. |

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Lifecycle Projection Writer Contract | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/01-lifecycle-projection-writer-contract-v1.md` | - |
| 02 | Pointer Invariant Contract | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/02-pointer-invariant-contract-v1.md` | 01 |
| 03 | Dispatch Lifecycle Contract | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/03-dispatch-lifecycle-contract-v1.md` | 01 |
| 04 | Closeout Recovery Taxonomy | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/04-closeout-recovery-taxonomy-v1.md` | 01, 02 |
| 05 | PID Liveness Contract | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/05-pid-liveness-contract-v1.md` | 01, 03 |

## Execution Order Notes
- Phase 01 is first because all later phases depend on one authoritative lifecycle projection event schema.
- Phase 02 can start after Phase 01 defines terminal event payload shape and target state files.
- Phase 03 can run after Phase 01 and must preserve existing `latest-dispatch.status` consumers.
- Phase 04 follows Phase 01/02 because terminal blocker taxonomy must write through the same lifecycle hook and obey terminal pointer invariant.
- Phase 05 follows Phase 01/03 because PID liveness evidence is part of dispatch lifecycle payloads.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Primary writer contract and event schema must be stable before downstream contracts. |
| wave-2 | 02, 03 | limited parallel | Disjoint implementation ownership is possible if Phase 02 stays in invariant verifier/test fixtures and Phase 03 stays in dispatch/latest-dispatch schema. |
| wave-3 | 04, 05 | limited parallel | Phase 04 touches finalizer/blocker projection; Phase 05 touches liveness namespace checker. Both consume Phase 01 event schema. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | User plan / Writer contract | `lib/lifecycle-projection-writer.mjs` is the primary writer and existing direct writers become callers. | 01 | `01-lifecycle-projection-writer-contract-v1.md` | mapped |
| REQ-1.2 | AC-01 | User plan / Event schema | Lifecycle event schema includes target files, primary target, phase identity, status fields, namespace, and payload patch. | 01 | `01-lifecycle-projection-writer-contract-v1.md` | mapped |
| REQ-1.3 | AC-01 | ENG Review / Writer ownership | Caller event types and direct writer removal order are explicit. | 01 | `01-lifecycle-projection-writer-contract-v1.md` | mapped |
| REQ-2.1 | AC-02 | ENG Review / Pointer invariant | `running/prepared` pointer checks differ from terminal pointer checks. | 02 | `02-pointer-invariant-contract-v1.md` | mapped |
| REQ-2.2 | AC-02 | User plan / Terminal pointer | Terminal workflow phase can match `completedPhaseNumber` or terminal event `phaseNumber`, not necessarily next active phase. | 02 | `02-pointer-invariant-contract-v1.md` | mapped |
| REQ-3.1 | AC-03 | ENG Review / Dispatch schema | `latest-dispatch.status` keeps existing enum while lifecycle state uses separate fields. | 03 | `03-dispatch-lifecycle-contract-v1.md` | mapped |
| REQ-3.2 | AC-03 | User plan / Lifecycle events | `preflight_passed`, `dispatch_started`, and `dispatch_failed` are lifecycle events, not status values. | 03 | `03-dispatch-lifecycle-contract-v1.md` | mapped |
| REQ-4.1 | AC-04 | ENG Review / Blocker taxonomy | clean, recovered blocker, and unrecovered blocker projections have fixed field contracts. | 04 | `04-closeout-recovery-taxonomy-v1.md` | mapped |
| REQ-4.2 | AC-04 | ENG Review / Final outcome compatibility | Unrecovered blocker does not write `normalizedRunVerdict=blocked` into canonical final-complete projection. | 04 | `04-closeout-recovery-taxonomy-v1.md` | mapped |
| REQ-5.1 | AC-05 | ENG Review / PID namespace | Lifecycle payload requires `pidNamespace: windows|wsl|node-parent`. | 05 | `05-pid-liveness-contract-v1.md` | mapped |
| REQ-5.2 | AC-05 | User plan / Liveness false positive | Namespace mismatch records `pid_namespace_mismatch` degraded evidence instead of stale child. | 05 | `05-pid-liveness-contract-v1.md` | mapped |
| REQ-6.1 | AC-06 | User plan / QA ledger | Plan package QA report includes Harness Change Ledger stating docs-only and no `.mjs` changes. | QA | `QA_REPORT.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Lifecycle Projection Writer Contract (`docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/01-lifecycle-projection-writer-contract-v1.md`)
- [x] Phase 02 - Pointer Invariant Contract (`docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/02-pointer-invariant-contract-v1.md`)
- [x] Phase 03 - Dispatch Lifecycle Contract (`docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/03-dispatch-lifecycle-contract-v1.md`)
- [x] Phase 04 - Closeout Recovery Taxonomy (`docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/04-closeout-recovery-taxonomy-v1.md`)
- [x] Phase 05 - PID Liveness Contract (`docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/05-pid-liveness-contract-v1.md`)

## Completion Rule
- Mark a phase checked only when its phase plan completion criteria and verification commands pass during a later implementation run.
- Do not expand canonical final-complete verdicts beyond `success | success_with_warning` unless a separate final-outcome contract expansion phase is approved.
- Runtime pointer preparation is intentionally out of scope for this document-writing turn.

