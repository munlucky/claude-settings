# Moonshot Harness Waste Reduction Master Plan v1

> This document is the plan of all plans for `moonshot-harness-waste-reduction-2026-05-06`.

## Source Baseline

- `WASTE_REGISTER.md` (role: scope/priority and source requirement register)
- User-provided Moonshot Harness Waste Reduction Plan in the Codex thread (role: technical direction)
- `.claude/logs/agent-loop/debug.jsonl` 2026-05-06 run window (role: measured failure evidence)
- `docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md` (role: prior reliability baseline; read-only)
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md` (role: prior implementation evidence; read-only)
- `.claude/verification.contract.yaml` (role: verification contract)

## Source Gaps and Open Decisions

- No `docs/PRD-v2.md`, `docs/SPEC-v2.md`, or `docs/GDD.md` exists. `WASTE_REGISTER.md` and the user-provided plan are the source baseline.
- `project-memory-agent` read-only recall was not available as a callable tool in this session. The plan uses repository docs and measured logs only.
- The two prior implementation packages are completed and must stay read-only for this effort.

## Objective

- Reduce Moonshot phase-runner waste without relaxing strict completion gates.
- Preserve healthy implementation retries while preventing retries caused by path authority, stale state, coordinator lifecycle, artifact sync, or log-noise failures.
- Produce a machine-readable waste ledger so future long runs can explain time spent by waste class.

## Non-goals

- Do not weaken source plan conformance, verification evidence, or final git closeout requirements.
- Do not modify completed closeout artifacts under `harness-reliability-retro-2026-05-05/` or `harness-native-awtl-rsme-2026-05-06/`.
- Do not move product implementation scope into this harness-control-plane plan.

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Path Authority Fail-fast | `01-path-authority-fail-fast-v1.md` | - |
| 02 | Active Verdict and Evidence Contract | `02-active-verdict-evidence-contract-v1.md` | Phase 01 |
| 03 | Dispatch Lifecycle and Retry Suppression | `03-dispatch-lifecycle-retry-suppression-v1.md` | Phase 01 |
| 04 | Closeout Artifact Synchronization | `04-closeout-artifact-sync-v1.md` | Phase 01, Phase 02 |
| 05 | Waste Ledger and Log Hygiene | `05-waste-ledger-log-hygiene-v1.md` | Phase 03, Phase 04 |
| 06 | Regression Fixture and Documentation Sync | `06-regression-doc-sync-v1.md` | Phases 01-05 |

## Execution Order Notes

- Phase 01 must run first because path authority is the highest-volume failure class and affects closeout, verdict relevance, and dispatch routing.
- Phases 02 and 03 can run after Phase 01 in parallel only if their `ownedPaths` remain disjoint.
- Phase 04 must wait for Phase 02 because closeout sync must use the active verdict contract.
- Phase 05 waits for dispatch and artifact behavior so waste ledger events have stable names.
- Phase 06 closes the plan with replay fixtures, verification contract updates, and documentation index updates.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | establishes path authority guard used by later gates |
| wave-2 | 02, 03 | conditional parallel | allowed only if Phase 02 avoids dispatch files and Phase 03 avoids verdict-state files |
| wave-3 | 04 | sequential | shared closeout writer depends on verdict relevance |
| wave-4 | 05 | sequential | observes final event names from Phases 03-04 |
| wave-5 | 06 | sequential | regression/docs closeout for all prior phases |

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| MWR-001 | WASTE_REGISTER | Path authority failures fail before worker launch | 01 | `01-path-authority-fail-fast-v1.md` | mapped |
| MWR-002 | WASTE_REGISTER | No default master plan fallback during phase closeout | 01 | `01-path-authority-fail-fast-v1.md` | mapped |
| MWR-003 | WASTE_REGISTER | Stale/superseded verdicts cannot block clean completion | 02 | `02-active-verdict-evidence-contract-v1.md` | mapped |
| MWR-004 | WASTE_REGISTER | Non-runtime/content-precondition verdicts classified separately | 02 | `02-active-verdict-evidence-contract-v1.md` | mapped |
| MWR-005 | WASTE_REGISTER | Missing verification evidence stops as contract failure | 02 | `02-active-verdict-evidence-contract-v1.md` | mapped |
| MWR-006 | WASTE_REGISTER | Coordinator restart-cap loops prevented | 03 | `03-dispatch-lifecycle-retry-suppression-v1.md` | mapped |
| MWR-007 | WASTE_REGISTER | Delegated terminal no-closeout restart loops blocked | 03 | `03-dispatch-lifecycle-retry-suppression-v1.md` | mapped |
| MWR-008 | WASTE_REGISTER | Stale worker cleanup scoped to active run | 03 | `03-dispatch-lifecycle-retry-suppression-v1.md` | mapped |
| MWR-009 | WASTE_REGISTER | Worktree fallback surfaced as evidence | 03 | `03-dispatch-lifecycle-retry-suppression-v1.md` | mapped |
| MWR-010 | WASTE_REGISTER | Dirty worktree preflight before expensive dispatch | 03 | `03-dispatch-lifecycle-retry-suppression-v1.md` | mapped |
| MWR-011 | WASTE_REGISTER | Closeout fields synchronized through structured writer | 04 | `04-closeout-artifact-sync-v1.md` | mapped |
| MWR-012 | WASTE_REGISTER | Artifact-only patch churn reduced | 04 | `04-closeout-artifact-sync-v1.md` | mapped |
| MWR-013 | WASTE_REGISTER | Repeated warnings summarized | 05 | `05-waste-ledger-log-hygiene-v1.md` | mapped |
| MWR-014 | WASTE_REGISTER | Deprecated Codex `--full-auto` removed | 05 | `05-waste-ledger-log-hygiene-v1.md` | mapped |
| MWR-015 | WASTE_REGISTER | MemoryGraph transport failures summarized once per run | 05 | `05-waste-ledger-log-hygiene-v1.md` | mapped |
| MWR-016 | WASTE_REGISTER | Abnormal retries recorded in waste ledger | 05 | `05-waste-ledger-log-hygiene-v1.md` | mapped |
| MWR-017 | WASTE_REGISTER | 2026-05-06 failure pattern becomes regression fixture | 06 | `06-regression-doc-sync-v1.md` | mapped |
| MWR-018 | WASTE_REGISTER | Related reliability docs indexed to avoid overlap | 06 | `06-regression-doc-sync-v1.md` | mapped |

## Unmapped Source Requirements

- None.

## Phase Completion Checklist

- [x] Phase 01 - Path Authority Fail-fast (`01-path-authority-fail-fast-v1.md`)
- [x] Phase 02 - Active Verdict and Evidence Contract (`02-active-verdict-evidence-contract-v1.md`)
- [x] Phase 03 - Dispatch Lifecycle and Retry Suppression (`03-dispatch-lifecycle-retry-suppression-v1.md`)
- [x] Phase 04 - Closeout Artifact Synchronization (`04-closeout-artifact-sync-v1.md`)
- [x] Phase 05 - Waste Ledger and Log Hygiene (`05-waste-ledger-log-hygiene-v1.md`)
- [x] Phase 06 - Regression Fixture and Documentation Sync (`06-regression-doc-sync-v1.md`)

## Completion Rule

- Mark a phase checked only when its phase plan completion criteria and verification evidence are satisfied.
- Do not declare full completion while any abnormal retry class remains untested.
- Do not treat warning filtering as success unless raw phase logs still preserve actionable error context.
