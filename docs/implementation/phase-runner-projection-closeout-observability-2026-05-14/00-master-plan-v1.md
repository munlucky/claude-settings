# Phase Runner Projection Closeout and Observability Remediation

## Source Baseline

This package follows the `phase-runner-state-board-closeout-remediation-2026-05-14` package. It intentionally excludes the items already covered there:

- stale active `STATE.md` after clean completion
- active board plus terminal projection invariant
- pending startup classification
- CRG Python fixture root and range diff hygiene
- CRG MCP fallback evidence for the review range

This package covers the remaining harness anomalies and bottlenecks observed in the `f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD` review.

| Req ID | Source | Requirement Summary |
| --- | --- | --- |
| REQ-1 | Review residual | `current-run.json` and `active-phase-run.json` can contain terminal, failed, and in-progress vocabulary in the same object. |
| REQ-2 | Review residual | `latest-dispatch.json` can remain `child_running` / `childAlive=true` after terminal or superseded dispatch state. |
| REQ-3 | Review residual | `phase-status.yaml` can mark a phase completed while `attempts.lastOutcome` remains `running`. |
| REQ-4 | Review residual | final git closeout status can remain stale after commit/push sync completes. |
| REQ-5 | Review residual | MemoryGraph unavailable evidence remains in projections without a clear decay, freshness, or strict/non-strict reconciliation policy. |
| REQ-6 | Review residual | native code-review-graph MCP transport failures remain undiagnosed beyond CLI fallback. |
| REQ-7 | Review residual | phase-runner wall clock is too high for narrow one-phase fixes and bottleneck ownership is not visible. |
| REQ-8 | Review residual | `verificationSeconds=0` can remain after substantial verification work, making runtime cost diagnosis unreliable. |
| REQ-9 | Review residual | there is no final post-closeout reconcile barrier that rechecks `STATE.md`, `phase-status.yaml`, `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` together. |

## Goal Contract

goalClarity: high
scopeClarity: high
acceptanceCriteriaClarity: high
verificationClarity: high
clarityScore: 0.925
ambiguityScore: 0.075
readinessDecision: review_passed_ready_for_runnable_preparation

The goal is to make harness closeout projections internally consistent, make terminal dispatch liveness unambiguous, reconcile post-git-closeout state, and expose enough telemetry to distinguish worker, verifier, closeout, and runtime dependency bottlenecks.

## Non-Goals

- Do not replace the simple run board design.
- Do not re-open the `STATE.md` terminal transition work already assigned to the closeout-remediation package.
- Do not change canonical terminal evidence sources.
- Do not implement a new database or event-sourcing layer.
- Do not require Codex Desktop restart as part of normal phase closeout.
- Do not make MemoryGraph or code-review-graph failures strict unless the active verification contract requires strict mode.

## Acceptance Criteria

| AC ID | Req ID | Requirement | Evidence Target |
| --- | --- | --- | --- |
| AC-1 | REQ-1 | Terminal `current-run.json` and `active-phase-run.json` projections have one canonical terminal vocabulary and no stale `failed` or `in_progress` fields. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`, `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs` |
| AC-2 | REQ-2 | Terminal or superseded `latest-dispatch.json` cannot keep `dispatchStage=child_running` or `childAlive=true`. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`, `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` |
| AC-3 | REQ-3 | Completed phase status updates force attempt outcome to a terminal value. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs`, `node --test .claude/scripts/verify-phase-closeout.test.mjs` |
| AC-4 | REQ-4 | After successful final git closeout, stale `phase-final-git-closeout-required`, `dirty_worktree`, and `checkpoint_required` status fields are cleared or replaced with terminal success fields. | `node --test .claude/scripts/phase-final-git-closeout.test.mjs` or focused equivalent |
| AC-5 | REQ-9 | A post-closeout reconcile barrier validates all workflow read models together and fails on any remaining split-brain. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs`, `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` |
| AC-6 | REQ-5 | MemoryGraph unavailable records include freshness, strictness, and decay semantics, and successful health removes stale non-strict warnings from current projections. | `node --test .claude/scripts/phase-capability-preflight.test.mjs`, `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` |
| AC-7 | REQ-6 | native code-review-graph MCP transport diagnosis records actionable root-cause evidence and avoids repeated same-run dead transport calls after failure. | `node --test .claude/scripts/check-mcp.test.mjs` |
| AC-8 | REQ-7 | Runner timing output separates total wall, worker active, verifier active, closeout, and idle/wait buckets. | `node --test .claude/scripts/agent-loop-phase-state.test.mjs`, `node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs` |
| AC-9 | REQ-8 | Verification command execution records non-zero `verificationSeconds` when verification commands run. | focused runner/state timing test |

## Phase Index

| Phase | File | Purpose | Dependency | Parallel |
| --- | --- | --- | --- | --- |
| 01 | `01-projection-vocabulary-canonicalization-v1.md` | Normalize `current-run` and `active-phase-run` terminal vocabulary. | None | No |
| 02 | `02-latest-dispatch-terminal-liveness-v1.md` | Scrub terminal dispatch liveness and add invariants. | Phase 01 | No |
| 03 | `03-phase-status-and-final-git-reconciliation-v1.md` | Fix phase attempt terminal outcome and stale final-git closeout status. | Phase 01 | No |
| 04 | `04-post-closeout-reconcile-barrier-v1.md` | Add final read-model reconciliation after closeout. | Phases 01-03 | No |
| 05 | `05-runtime-dependency-health-reconciliation-v1.md` | Repair MemoryGraph/CRG health projection and diagnosis behavior. | Phases 02 and 04 | No |
| 06 | `06-runner-bottleneck-telemetry-v1.md` | Make phase-runner wall-clock and verification timing attributable. | Phases 01-04 | No |

## Parallel Execution Plan

Wave 1:

- Phase 01 runs first because later phases should consume the terminal vocabulary table it defines.

Wave 2:

- Phase 02 and Phase 03 both depend on Phase 01. They should remain sequential unless implementation confirms disjoint write paths.

Wave 3:

- Phase 04 runs after Phases 01-03 because it validates the full closeout state.
- Phase 05 runs after Phase 04. It shares `harness-state-invariants.mjs` and `harness-state-invariants.test.mjs` with Phases 02 and 04, so it is not parallel eligible even though the runtime dependency health behavior is logically separate.
- Phase 06 runs last so its telemetry buckets include the reconciled closeout path.

## Source Traceability

| Req ID | AC ID | Phase | Plan File | Status |
| --- | --- | --- | --- | --- |
| REQ-1 | AC-1 | 01 | `01-projection-vocabulary-canonicalization-v1.md` | planned |
| REQ-2 | AC-2 | 02 | `02-latest-dispatch-terminal-liveness-v1.md` | planned |
| REQ-3 | AC-3 | 03 | `03-phase-status-and-final-git-reconciliation-v1.md` | planned |
| REQ-4 | AC-4 | 03 | `03-phase-status-and-final-git-reconciliation-v1.md` | planned |
| REQ-9 | AC-5 | 04 | `04-post-closeout-reconcile-barrier-v1.md` | planned |
| REQ-5 | AC-6 | 05 | `05-runtime-dependency-health-reconciliation-v1.md` | planned |
| REQ-6 | AC-7 | 05 | `05-runtime-dependency-health-reconciliation-v1.md` | planned |
| REQ-7 | AC-8 | 06 | `06-runner-bottleneck-telemetry-v1.md` | planned |
| REQ-8 | AC-9 | 06 | `06-runner-bottleneck-telemetry-v1.md` | planned |

## Phase Completion Checklist

- [x] Phase 01 - Projection Vocabulary Canonicalization (`01-projection-vocabulary-canonicalization-v1.md`)
- [x] Phase 02 - Latest Dispatch Terminal Liveness (`02-latest-dispatch-terminal-liveness-v1.md`)
- [x] Phase 03 - Phase Status and Final Git Reconciliation (`03-phase-status-and-final-git-reconciliation-v1.md`)
- [x] Phase 04 - Post Closeout Reconcile Barrier (`04-post-closeout-reconcile-barrier-v1.md`)
- [x] Phase 05 - Runtime Dependency Health Reconciliation (`05-runtime-dependency-health-reconciliation-v1.md`)
- [x] Phase 06 - Runner Bottleneck Telemetry (`06-runner-bottleneck-telemetry-v1.md`)

## Runnable Preparation Gate

Do not run `prepare-implementation-plan-state.mjs` for this package until the preceding `phase-runner-state-board-closeout-remediation-2026-05-14` package is either completed or explicitly deferred. This package assumes the board/projection conflict gate from that package is available.

Before runnable preparation:

1. Confirm this package is selected over the current active plan pointer.
2. Confirm the closeout-remediation package is not modifying the same phase runner files concurrently.
3. Run `prepare-implementation-plan-state.mjs --dry-run` and verify the phase inventory lists only this package.
4. Archive or reconcile stale workflow projections before dispatch.

## Plan Quality Loop

Status: independent planning loop completed.

The user explicitly approved forked Reviewer Agent and Writer Agent sessions for this planning loop.

Reviewer iteration 1 returned `decision: revise`, `ambiguityScore: 0.178`, with three blocking directives:

- Phase 05 shared invariant ownership had unsafe parallel sequencing.
- Phase 01 terminal projection vocabulary was still conditional.
- Phase 05 CRG MCP and MemoryGraph contracts needed exact diagnostic, freshness, decay, cache, and verification command details.

Writer iteration 1 applied all directives:

- Phase 05 is no longer parallel with Phase 02/04 invariant work.
- Phase 01 has a fixed per-file terminal projection vocabulary table.
- Phase 05 defines MemoryGraph freshness/decay and CRG MCP diagnostic/cache/fallback contracts.
- AC-7 and Phase 05 validation use `node --test .claude/scripts/check-mcp.test.mjs` as the exact focused command.

Reviewer iteration 2 returned `decision: revise`, `ambiguityScore: 0.135`, with no plan-content blockers. The remaining findings were planning-loop artifact cleanup only.

Controller artifact cleanup updated `controller-state.yaml`, `plan-writer-revision-iter-01.yaml`, and recorded `plan-quality-review-iter-02.yaml`.

Reviewer iteration 3 returned `decision: pass`, `ambiguityScore: 0.075`, `blockingFindings: []`, and `improvementDirectives: []`.

Current controller decision: `review_passed_ready_for_runnable_preparation`.

## Verification Plan

Minimum closeout commands after implementation:

```powershell
node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs
node --test .claude/scripts/lib/phase-run-lease-store.test.mjs
node --test .claude/scripts/moonshot-phase-dispatch.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/agent-loop-phase-state.test.mjs
node --test .claude/scripts/verify-phase-closeout.test.mjs
node --test .claude/scripts/phase-closeout-finalize.test.mjs
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs
git diff --check
```

If a listed focused test file does not exist at implementation time, create the narrowest equivalent test near the changed module and record the replacement in phase QA evidence.
