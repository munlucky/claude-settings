# Harness Closeout State Invariant Hardening Master Plan v1

> 이 문서는 `Harness Closeout State Invariant Hardening Plan v10`을 실행 가능한 phase 작업문서로 내린 상위 계획입니다.

## Source Baseline
- 사용자 승인 계획: `Harness Closeout State Invariant Hardening Plan v10` (역할: 범위/우선순위, technical contract)
- 리뷰 조건: v1-v10 planEngReview findings (역할: implementation constraints)
- `.claude/scripts/phase-closeout-finalize.mjs` (역할: closeout publish entrypoint)
- `.claude/scripts/verification-verdict-state.mjs` (역할: verdict/current reader)
- `.claude/scripts/verify-phase-closeout.mjs` (역할: closeout verifier)
- `.claude/scripts/workflow-enforcement.mjs` (역할: workflow enforcement reader)
- `.claude/scripts/write-verification-verdict.py` (역할: verdict writer)
- `.claude/scripts/agent-loop-phase-artifacts.mjs` (역할: WORKSETS/QA/HANDOFF/SCORECARD projection)
- `.claude/scripts/lib/waste-ledger.mjs` (역할: warning/noise ledger)
- `.claude/docs/phase-status.yaml` (역할: current runtime pointer; 이번 문서 작성에서는 수정하지 않음)

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
- `current-artifacts.json`을 유일한 current source로 만들고, closeout reader들이 scan/mtime 기반 current 판정을 하지 못하게 한다.
- closeout publish를 tokenized staging, immutable manifest, current pointer last semantics로 고정한다.
- raw bytes SHA-256, memory-only dry-run, closeout diagnostics, mutable log snapshot, versioned supersede archive를 contract로 만든다.
- 기존 finalizer와 canonical artifact naming은 유지한다.

## Scope
- 포함:
  - current artifacts reader helper와 fixture 기반 first slice
  - index-first reader migration
  - dry-run output contract와 diagnostics ledger
  - tokenized staging publish 및 manifest/current pointer 순서
  - versioned supersede archive와 mutable log snapshot
  - authoritative verdict identity mode
  - post-publish goal runtime sidecar
  - artifact projection guard, composite monitor, waste-ledger routing
- 제외:
  - 새 phase runner 도입
  - canonical artifact naming 교체
  - `.claude/runtime-state.sqlite` schema 전면 재설계
  - 과거 실제 세션 JSONL에 의존하는 비결정적 테스트
  - downstream 프로젝트 동기화

## Phase Index
| Phase | Title | Plan File | Dependencies |
|------|-------|-----------|--------------|
| 01 | Current Artifacts Reader And Fixtures | `docs/implementation/harness-closeout-state-invariant-2026-05-11/01-current-artifacts-reader-fixtures-v1.md` | - |
| 02 | Dry-Run And Diagnostics Contract | `docs/implementation/harness-closeout-state-invariant-2026-05-11/02-dry-run-diagnostics-contract-v1.md` | 01 |
| 03 | Staged Publish Manifest And Current Pointer | `docs/implementation/harness-closeout-state-invariant-2026-05-11/03-staged-publish-manifest-current-pointer-v1.md` | 01, 02 |
| 04 | Versioned Supersede Archive And Log Snapshot | `docs/implementation/harness-closeout-state-invariant-2026-05-11/04-versioned-supersede-archive-v1.md` | 03 |
| 05 | Authoritative Verdict Identity Mode | `docs/implementation/harness-closeout-state-invariant-2026-05-11/05-authoritative-verdict-identity-v1.md` | 01 |
| 06 | Post-Publish Goal Runtime Sidecar | `docs/implementation/harness-closeout-state-invariant-2026-05-11/06-post-publish-goal-runtime-sidecar-v1.md` | 03 |
| 07 | Artifact Projection Guard | `docs/implementation/harness-closeout-state-invariant-2026-05-11/07-artifact-projection-guard-v1.md` | 03, 04, 05 |
| 08 | Composite Monitor And Noise Routing | `docs/implementation/harness-closeout-state-invariant-2026-05-11/08-composite-monitor-noise-routing-v1.md` | 01, 03, 07 |

## Execution Order Notes
- Phase 01 is the mandatory first slice. It must deliver `current-artifacts-state.mjs`, fixtures, 3 reader migrations, and the stale-canonical-ignored test in one change set.
- Phase 02 defines dry-run and diagnostics before mutating publish behavior so later publish failures have stable evidence.
- Phase 03 changes finalizer publish semantics. It must not start until reader migration is index-first.
- Phase 04 preserves historical artifacts without treating canonical path equality as supersede identity.
- Phase 05 can run after Phase 01 because it targets Python writer identity behavior, but it must integrate with Phase 03 before closeout publish is considered complete.
- Phase 06 is intentionally post-publish because goal runtime close is not rollback-safe.
- Phase 07 and 08 are later hardening slices; they depend on the current-source contract being stable.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Establishes single current source and fixtures. |
| wave-2 | 02, 05 | limited parallel | Disjoint files if Phase 02 stays in finalizer/diagnostics and Phase 05 stays in verdict writer/schema; both read Phase 01 helper contract. |
| wave-3 | 03 | sequential | Shared finalizer publish path. |
| wave-4 | 04, 06 | limited parallel | Both depend on Phase 03; avoid concurrent edits to the same finalizer blocks. |
| wave-5 | 07 | sequential | Projection gate touches shared artifact writer. |
| wave-6 | 08 | sequential | Monitor reads outputs from prior phases. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | Plan v10 | `current-artifacts.json` is the only current source; missing index fails in current mode. | 01 | `01-current-artifacts-reader-fixtures-v1.md` | mapped |
| REQ-1.2 | AC-02 | Plan v10 | Helper centralizes raw hash, commit token, path existence, and legacy scan behavior. | 01 | `01-current-artifacts-reader-fixtures-v1.md` | mapped |
| REQ-1.3 | AC-03 | Plan v10 | Dry-run writes no files by default and reports planned writes. | 02 | `02-dry-run-diagnostics-contract-v1.md` | mapped |
| REQ-1.4 | AC-04 | Plan v10 | Closeout diagnostics use `closeout-diagnostics.jsonl` with stderr/phase-log fallback. | 02 | `02-dry-run-diagnostics-contract-v1.md` | mapped |
| REQ-1.5 | AC-05 | Plan v10 | Publish order is canonical artifacts, immutable manifest, then current pointer last. | 03 | `03-staged-publish-manifest-current-pointer-v1.md` | mapped |
| REQ-1.6 | AC-06 | Plan v10 | Manifest and artifact hash are raw bytes SHA-256; mtime is debug evidence only. | 03 | `03-staged-publish-manifest-current-pointer-v1.md` | mapped |
| REQ-1.7 | AC-07 | Plan v10 | Supersede uses versioned snapshot/hash, not canonical path equality. | 04 | `04-versioned-supersede-archive-v1.md` | mapped |
| REQ-1.8 | AC-08 | Plan v10 | Mutable logs use `hashAtSnapshotTime` and are excluded from strict active hash invalidation. | 04 | `04-versioned-supersede-archive-v1.md` | mapped |
| REQ-1.9 | AC-09 | Plan v10 | Authoritative verdict identity hard fail uses one `isAuthoritativeVerdict(args)` function. | 05 | `05-authoritative-verdict-identity-v1.md` | mapped |
| REQ-1.10 | AC-10 | Plan v10 | Goal runtime close result is post-publish sidecar evidence, not transaction state. | 06 | `06-post-publish-goal-runtime-sidecar-v1.md` | mapped |
| REQ-1.11 | AC-11 | Plan v10 | Projection guards reject `Log: none`, generated stale phase tokens, and unstable WORKSETS rewrites. | 07 | `07-artifact-projection-guard-v1.md` | mapped |
| REQ-1.12 | AC-12 | Plan v10 | Composite monitor reads current index/manifest/lease/logs and routes warning noise to waste-ledger. | 08 | `08-composite-monitor-noise-routing-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Current Artifacts Reader And Fixtures (`docs/implementation/harness-closeout-state-invariant-2026-05-11/01-current-artifacts-reader-fixtures-v1.md`)
- [x] Phase 02 - Dry-Run And Diagnostics Contract (`docs/implementation/harness-closeout-state-invariant-2026-05-11/02-dry-run-diagnostics-contract-v1.md`)
- [x] Phase 03 - Staged Publish Manifest And Current Pointer (`docs/implementation/harness-closeout-state-invariant-2026-05-11/03-staged-publish-manifest-current-pointer-v1.md`)
- [x] Phase 04 - Versioned Supersede Archive And Log Snapshot (`docs/implementation/harness-closeout-state-invariant-2026-05-11/04-versioned-supersede-archive-v1.md`)
- [x] Phase 05 - Authoritative Verdict Identity Mode (`docs/implementation/harness-closeout-state-invariant-2026-05-11/05-authoritative-verdict-identity-v1.md`)
- [x] Phase 06 - Post-Publish Goal Runtime Sidecar (`docs/implementation/harness-closeout-state-invariant-2026-05-11/06-post-publish-goal-runtime-sidecar-v1.md`)
- [x] Phase 07 - Artifact Projection Guard (`docs/implementation/harness-closeout-state-invariant-2026-05-11/07-artifact-projection-guard-v1.md`)
- [x] Phase 08 - Composite Monitor And Noise Routing (`docs/implementation/harness-closeout-state-invariant-2026-05-11/08-composite-monitor-noise-routing-v1.md`)

## Completion Rules
- Do not mark a phase complete until its phase plan completion checklist is satisfied and evidence exists.
- Do not dispatch this plan until `.claude/docs/phase-status.yaml`, `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` are prepared for this exact master plan and execution root.
- Runtime pointer preparation is intentionally out of scope for this document-writing turn.
