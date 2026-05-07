# Harness Nonwork Failure Prevention Master Plan v1

> This document is the plan of all plans for `harness-nonwork-failure-prevention-2026-05-07`.

## Source Baseline

- User request in the Codex thread on 2026-05-07 (role: scope/priority and failure inventory)
- Proposed plan in the Codex thread: "하네스 비업무 실패 예방 개선 계획" (role: technical direction)
- `docs/implementation/harness-reliability-retro-2026-05-05/ISSUE_REGISTER.md` (role: prior environment/runtime blocker baseline)
- `docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md` and `WASTE_REGISTER.md` (role: prior waste/retry reduction baseline)
- `docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md` (role: MemoryGraph and AWTL unavailable-policy baseline)
- `.claude/scripts/phase-capability-preflight.mjs`, `.claude/scripts/lib/failure-classifier.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-runtime.mjs`, `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/phase-final-git-closeout.mjs` (role: current implementation entrypoints)
- `.claude/verification.contract.yaml` (role: verification contract)

## Source Gaps And Decisions

- `docs/PRD-v2.md`, `docs/SPEC-v2.md`, and `docs/GDD.md` are absent. The user-provided failure inventory and existing harness implementation plans are the source baseline.
- MemoryGraph plan recall was attempted and failed with `Transport closed`; this is recorded as a non-blocking source gap and must not be treated as phase failure.
- The plan targets nonwork failures only. Product implementation defects, code review findings, and verifier assertion failures remain normal phase gate failures.
- Existing completed implementation packages are read-only evidence. This plan must create a new work package and must not rewrite prior closeout artifacts.

## Objective

- Prevent or short-circuit nonwork failures that delayed phase execution: Codex session/storage permission errors, stale edit/retry churn, runtime/verifier unavailability, state/log contamination, MemoryGraph transport failures, runtime parity skip ambiguity, and Git closeout friction.
- Ensure nonwork failures are classified before worker implementation loops and recorded as environment/runtime/state/closeout blockers or warnings.
- Preserve strict review and verification gates for actual work results.

## Non-goals

- Do not relax `SCORECARD.md`, `QA_REPORT.md`, review, or verification completion requirements.
- Do not hide raw logs; summarize repeated noise while preserving actionable evidence.
- Do not repair host filesystem permissions directly. Prefer isolated probe homes, explicit fallback, or stable handoff records.
- Do not make MemoryGraph write availability a phase pass/fail gate unless a future strict memory gate explicitly requires it.

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Environment Preflight And Failure Taxonomy | `01-environment-preflight-failure-taxonomy-v1.md` | - |
| 02 | Runtime Retry And Worker Fallback Guard | `02-runtime-retry-worker-fallback-guard-v1.md` | 01 |
| 03 | Verdict Identity And Staleness Guard | `03-verdict-identity-staleness-guard-v1.md` | 01 |
| 04 | Phase Status Rebuilder And Lease Normalization | `04-phase-status-rebuilder-lease-normalization-v1.md` | 03 |
| 05 | Runtime Parity Verdict Split | `05-runtime-parity-verdict-split-v1.md` | 03 |
| 06 | Commit Closeout Preflight And Regression Sync | `06-commit-closeout-preflight-regression-sync-v1.md` | 01-05 |

## Execution Order Notes

- Phase 01 must run first because all later retry/fallback logic depends on stable failure codes and preflight output.
- Phase 02 uses Phase 01 classifier decisions to avoid sending environment failures into worker auto-fix.
- Phase 03 establishes active verdict identity before Phase 04 rebuilds state from artifacts and before Phase 05 records richer runtime parity verdicts.
- Phase 04 must follow Phase 03 so stale verdicts do not become canonical status during rebuild.
- Phase 05 can run after Phase 03; it updates parity semantics without changing status rebuild behavior.
- Phase 06 closes the package with Git/MemoryGraph closeout hardening, docs, and cross-phase regression checks.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | establishes shared failure taxonomy and preflight schema |
| wave-2 | 02, 03 | conditional parallel | allowed only if Phase 02 avoids verdict files and Phase 03 avoids runtime runner files |
| wave-3 | 04, 05 | conditional parallel | allowed only after Phase 03; Phase 04 owns state/lease, Phase 05 owns runtime parity scripts |
| closeout | 06 | sequential | touches closeout, dispatch, verification contract, and docs |

- Default execution should stay sequential because the touched surfaces are shared harness control-plane files.
- Phase-level parallelism is allowed only when each phase keeps to its declared `ownedPaths` and no shared mutable file is changed outside its phase.

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| NWFP-001 | User failure inventory | Codex session creation/storage/state DB permission failures are preflighted and classified | 01 | `01-environment-preflight-failure-taxonomy-v1.md` | mapped |
| NWFP-002 | User failure inventory | shell snapshot, MCP cleanup, PATH/plugin/network sync noise is summarized and not retried blindly | 01, 02 | `01-environment-preflight-failure-taxonomy-v1.md`, `02-runtime-retry-worker-fallback-guard-v1.md` | mapped |
| NWFP-003 | User improvement units | Node/Bash/Git/rg/MemoryGraph capability probes run before expensive phase work | 01 | `01-environment-preflight-failure-taxonomy-v1.md` | mapped |
| NWFP-004 | User improvement units | EPERM/access denied/spawn blocked/verifier unavailable get one controlled fallback, then stable blocker | 02 | `02-runtime-retry-worker-fallback-guard-v1.md` | mapped |
| NWFP-005 | User improvement units | Verdict staleness uses run lease, plan dir, status file, and git tree identity | 03 | `03-verdict-identity-staleness-guard-v1.md` | mapped |
| NWFP-006 | User improvement units | `phase-status.yaml` can be rebuilt from ledger/artifacts and normalized after finished runs | 04 | `04-phase-status-rebuilder-lease-normalization-v1.md` | mapped |
| NWFP-007 | User improvement units | Runtime parity separates skipped probes, warning passes, exercised runs, and full exercise | 05 | `05-runtime-parity-verdict-split-v1.md` | mapped |
| NWFP-008 | User improvement units | Commit closeout preflights Git index writes, ignored evidence, deny patterns, MemoryGraph state, and HEAD | 06 | `06-commit-closeout-preflight-regression-sync-v1.md` | mapped |
| NWFP-009 | Prior reliability baseline HR-019/HR-036 | Repeated same environment failure is retry-suppressed and stale verdicts cannot override active pass | 02, 03 | `02-runtime-retry-worker-fallback-guard-v1.md`, `03-verdict-identity-staleness-guard-v1.md` | mapped |
| NWFP-010 | Prior waste baseline MWR-014/MWR-015 | Deprecated Codex warnings and MemoryGraph transport failures stay out of phase success/failure semantics | 01, 06 | `01-environment-preflight-failure-taxonomy-v1.md`, `06-commit-closeout-preflight-regression-sync-v1.md` | mapped |

## Unmapped Source Requirements

- None.

## Phase Completion Checklist

- [x] Phase 01 - Environment Preflight And Failure Taxonomy (`01-environment-preflight-failure-taxonomy-v1.md`)
- [x] Phase 02 - Runtime Retry And Worker Fallback Guard (`02-runtime-retry-worker-fallback-guard-v1.md`)
- [x] Phase 03 - Verdict Identity And Staleness Guard (`03-verdict-identity-staleness-guard-v1.md`)
- [x] Phase 04 - Phase Status Rebuilder And Lease Normalization (`04-phase-status-rebuilder-lease-normalization-v1.md`)
- [x] Phase 05 - Runtime Parity Verdict Split (`05-runtime-parity-verdict-split-v1.md`)
- [x] Phase 06 - Commit Closeout Preflight And Regression Sync (`06-commit-closeout-preflight-regression-sync-v1.md`)

## Completion Rule

- Mark a phase checked only when its phase plan completion criteria and fresh verification evidence are satisfied.
- Do not count a product review/verifier failure as a nonwork failure in this plan.
- Do not treat MemoryGraph unavailable, Codex storage unavailable, or runtime probe skipped as a successful full exercise.
- Do not declare full completion while stale root status, stale verdict, or delegated terminal exit mismatch remains untested.
