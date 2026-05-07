# Harness Worker Overhead Reduction Master Plan v1

> This document is the plan of all plans for `harness-worker-overhead-reduction-2026-05-07`.

## Source Baseline

- User request in the Codex thread on 2026-05-07: "Harness Worker Overhead 개선 계획" and the nine-item overhead analysis (role: scope/priority and source requirement register).
- Proposed plan in the Codex thread: "Harness Worker Overhead 개선 계획" (role: technical direction).
- `docs/implementation/moonshot-harness-waste-reduction-2026-05-06/WASTE_REGISTER.md` (role: measured waste baseline).
- `docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md` (role: prior waste-reduction baseline; read-only).
- `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md` (role: prior nonwork-failure baseline; read-only).
- Current implementation entrypoints: `.claude/scripts/write-verification-verdict.py`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/lib/failure-classifier.mjs`, `.claude/scripts/agent-loop-phase-runtime.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/runtime-cli.mjs`.
- `.claude/verification.contract.yaml` (role: verification contract).

## Source Gaps And Decisions

- `docs/PRD-v2.md`, `docs/SPEC-v2.md`, and `docs/GDD.md` are absent. The user-provided failure inventory, prior harness plans, and current code inspection are the source baseline.
- MemoryGraph direct health succeeded during planning, but a callable `project-memory-agent` was not used in this turn. No raw MemoryGraph records are merged into this plan.
- Existing completed implementation packages are read-only evidence. This package must not rewrite prior closeout artifacts.
- This plan preserves strict verification/review/scorecard gates. It changes how evidence is written, classified, cached, and logged.

## Objective

- Reduce worker overhead caused by attempt churn, stale artifact patching, verdict placeholder ambiguity, runtime warning loops, MCP/MemoryGraph noise, deprecated CLI warnings, startup tax, prompt log bloat, and artifact bookkeeping.
- Shift completion truth toward structured artifacts and deterministic writers without weakening existing phase completion criteria.
- Make every nonwork/runtime failure class either fail fast, get one controlled fallback, or stop with a stable handoff instead of launching broad implementation workers.

## Non-goals

- Do not relax review, plan conformance, verification freshness, score target, or final closeout requirements.
- Do not modify completed plan packages under `moonshot-harness-waste-reduction-2026-05-06/` or `harness-nonwork-failure-prevention-2026-05-07/`.
- Do not repair host filesystem, Docker, network, or external MCP permissions directly.
- Do not remove human-readable QA, SCORECARD, HANDOFF, or WORKSETS artifacts; make them projections of structured state where possible.

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Verdict RequiredChecks Contract | `01-verdict-required-checks-contract-v1.md` | - |
| 02 | Failure Classifier Raw Runtime Taxonomy | `02-failure-classifier-raw-runtime-taxonomy-v1.md` | 01 |
| 03 | Spawn Prompt Redaction And Log Hygiene | `03-spawn-prompt-redaction-log-hygiene-v1.md` | 02 |
| 04 | Structured Artifact Writer Expansion | `04-structured-artifact-writer-expansion-v1.md` | 01 |
| 05 | Completion Gate Reason Taxonomy And Retry Policy | `05-completion-gate-reason-taxonomy-retry-policy-v1.md` | 01, 02, 04 |
| 06 | Runtime Unavailable Cache And MemoryGraph Policy | `06-runtime-unavailable-cache-memorygraph-policy-v1.md` | 02, 05 |
| 07 | Regression Fixture And Documentation Sync | `07-regression-fixture-documentation-sync-v1.md` | 01-06 |

## Execution Order Notes

- Phase 01 runs first because `missingRequiredChecks` is a latent blocker that can invalidate otherwise correct verification evidence.
- Phase 02 must follow Phase 01 so runtime blocker verdicts and no-retry classifications use a stable verdict schema.
- Phase 03 can run after Phase 02 because prompt/log redaction should preserve classified runtime evidence while removing large prompt payloads.
- Phase 04 can run after Phase 01 and before Phase 05 because gate policy should consume structured artifact state.
- Phase 05 depends on Phase 01, 02, and 04 because gate reason normalization needs stable verdicts, classifier decisions, and writer outputs.
- Phase 06 depends on Phase 05 so run-level unavailable cache has a clear retry-policy consumer.
- Phase 07 closes the package with regression tests and docs after all behavior names stabilize.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|---|---|---|---|
| wave-1 | 01 | sequential | establishes verdict contract shared by gate and writers |
| wave-2 | 02 | sequential | classifier decisions feed runtime, dispatch, and gate behavior |
| wave-3 | 03, 04 | conditional parallel | allowed only if Phase 03 touches runtime logging files and Phase 04 touches artifact writer files without shared edits |
| wave-4 | 05 | sequential | changes completion gate semantics and retry policy |
| wave-5 | 06 | sequential | adds run-level cache and unavailable semantics after gate policy is stable |
| closeout | 07 | sequential | regression/docs sync across all prior phases |

- Default execution should stay sequential because these phases touch shared harness control-plane files.
- Parallel execution is allowed only when each worker keeps to its declared `ownedPaths` and does not modify shared mutable files.

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|
| HWO-001 | User overhead item 1 | Attempt churn from closeout/bookkeeping gaps must not relaunch full implementation workers | 04, 05 | `04-structured-artifact-writer-expansion-v1.md`, `05-completion-gate-reason-taxonomy-retry-policy-v1.md` | mapped |
| HWO-002 | User overhead item 2 | `apply_patch` failures on QA/SCORECARD/HANDOFF/WORKSETS/phase-status must be replaced by idempotent writers | 04 | `04-structured-artifact-writer-expansion-v1.md` | mapped |
| HWO-003 | User overhead item 3 | `missingRequiredChecks` must treat machine "none" as empty array or reject it before gate loops | 01 | `01-verdict-required-checks-contract-v1.md` | mapped |
| HWO-004 | User overhead item 4 | MCP process group cleanup failures must classify as nonwork environment cleanup noise | 02, 06 | `02-failure-classifier-raw-runtime-taxonomy-v1.md`, `06-runtime-unavailable-cache-memorygraph-policy-v1.md` | mapped |
| HWO-005 | User overhead item 5 | MemoryGraph `Transport closed` must be cached/summarized and not repeated in closeout/remediation attempts | 02, 06 | `02-failure-classifier-raw-runtime-taxonomy-v1.md`, `06-runtime-unavailable-cache-memorygraph-policy-v1.md` | mapped |
| HWO-006 | User overhead item 6 | Deprecated Codex `--full-auto` must stay removed with regression coverage | 07 | `07-regression-fixture-documentation-sync-v1.md` | mapped |
| HWO-007 | User overhead item 7 | startup network/plugin/PATH warnings must classify once and avoid repeated retry tax | 02, 06 | `02-failure-classifier-raw-runtime-taxonomy-v1.md`, `06-runtime-unavailable-cache-memorygraph-policy-v1.md` | mapped |
| HWO-008 | User overhead item 8 | full prompt logging must be replaced by prompt hash/archive references | 03 | `03-spawn-prompt-redaction-log-hygiene-v1.md` | mapped |
| HWO-009 | User overhead item 9 | artifact bookkeeping must be shifted from LLM manual editing to structured writer/gate inputs | 04, 05 | `04-structured-artifact-writer-expansion-v1.md`, `05-completion-gate-reason-taxonomy-retry-policy-v1.md` | mapped |
| HWO-010 | Prior MWR-011/MWR-012 | Closeout fields synchronized by structured writer and patch churn reduced | 04 | `04-structured-artifact-writer-expansion-v1.md` | mapped |
| HWO-011 | Prior MWR-013/MWR-015 | repeated warnings and MemoryGraph transport failures summarized | 03, 06 | `03-spawn-prompt-redaction-log-hygiene-v1.md`, `06-runtime-unavailable-cache-memorygraph-policy-v1.md` | mapped |
| HWO-012 | Prior NWFP-009/NWFP-010 | same environment failures suppress retries; deprecated warnings stay out of success/failure semantics | 02, 05, 07 | `02-failure-classifier-raw-runtime-taxonomy-v1.md`, `05-completion-gate-reason-taxonomy-retry-policy-v1.md`, `07-regression-fixture-documentation-sync-v1.md` | mapped |

## Unmapped Source Requirements

- None.

## Phase Completion Checklist

- [x] Phase 01 - Verdict RequiredChecks Contract (`01-verdict-required-checks-contract-v1.md`)
- [x] Phase 02 - Failure Classifier Raw Runtime Taxonomy (`02-failure-classifier-raw-runtime-taxonomy-v1.md`)
- [x] Phase 03 - Spawn Prompt Redaction And Log Hygiene (`03-spawn-prompt-redaction-log-hygiene-v1.md`)
- [x] Phase 04 - Structured Artifact Writer Expansion (`04-structured-artifact-writer-expansion-v1.md`)
- [x] Phase 05 - Completion Gate Reason Taxonomy And Retry Policy (`05-completion-gate-reason-taxonomy-retry-policy-v1.md`)
- [x] Phase 06 - Runtime Unavailable Cache And MemoryGraph Policy (`06-runtime-unavailable-cache-memorygraph-policy-v1.md`)
- [x] Phase 07 - Regression Fixture And Documentation Sync (`07-regression-fixture-documentation-sync-v1.md`)

## Completion Rule

- Mark a phase checked only when its phase plan completion criteria, review evidence, and fresh verification evidence are satisfied.
- Do not declare this package complete while any listed raw failure string still maps to `unknown_failure`.
- Do not declare this package complete while a placeholder missing check can produce `missingRequiredChecks`.
- Do not declare this package complete while spawn logs can include a full worker prompt in `SUPERVISOR_EVENT`.
- Do not prepare `.claude/docs/phase-status.yaml` for this package unless the user explicitly asks to run it as the next execution target.
