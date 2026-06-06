# Resumable Session Layer

Canonical source guideline for resumable session state and recovery boundaries.

Resumable sessions need a stable objective, current phase, last successful evidence, and next command.
Runtime state may record leases, events, attempts, verdicts, and resume snapshots, but generated state is not canonical source.
On restart, prefer `scripts/runtime-state.mjs status --json` and its read model over replaying chat history.
The required resume surface is `runtimeCapabilityStatus`, `compactStatus.activeContract`, `compactStatus.latestVerdict`, `compactStatus.currentBlocker`, `compactStatus.lineage`, `compactStatus.staleWarnings`, `resumeBrief.nextAction`, `resumeBrief.currentBlocker`, and `resumeBrief.lineage`.
For phase attempts, build the runnable resume object with `scripts/context-state.mjs build --run-id <runId> --goal-id <goalId> --json`.
The context state must preserve objective, phase, current blocker, lineage, assumptions, evidence, changed files, open risks, projection freshness, and next action.
Stale projections or stale lease warnings make the context state completion-ineligible until refreshed; they may guide resume but must not close completion authority.
If recovery changes behavior, record whether it was a normal resume, compatibility fallback, or manual repair.

## Operations Signals

Resume operators must inspect `operationalMetrics` with the status read model.
The required metric surface includes `completion_false_positive_rate`, `run_resume_success_rate`, `tool_invalid_call_rate`, `prompt_cache_hit_ratio`, `context_compaction_ratio`, `db_busy_timeout_count`, `browser_trace_flaky_rate`, `security_open_alerts`, `eval_regression_worsened_count`, and `memory_promotion_rollback_count`.

Recovery order:

1. Restore runtime-state capability when status is degraded.
2. Clear stale leases with `scripts/runtime-state.mjs cleanup-stale-leases --json`.
3. Resolve `compactStatus.pendingApprovals` and `compactStatus.blockingEvents`.
4. Follow `compactStatus.evalRegressions[*].evidence.traceCandidatePath` into the trace-to-testcase improvement loop.
5. Rebuild context with `scripts/context-state.mjs build --run-id <runId> --goal-id <goalId> --json`.

Do not resume into a clean-finish claim while release-blocking metrics remain active.
