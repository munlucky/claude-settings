# Phase 12 - Observability, Metrics, and Operations v2

## Goal

Expose enough runtime facts to operate and continuously improve the harness.

## Execution Metadata

- Dependencies: Phase 03, Phase 04, Phase 05, Phase 08, Phase 09, Phase 11.
- Owned paths: `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs`, `docs/public/runtime-control-plane.md`, `docs/public/guidelines/resumable-session-layer.md`, `tests/runtime-read-model-contract.test.mjs`, `tests/observability-metrics-contract.test.mjs`.
- Read-only paths: generated traces, logs, scorecards, runtime DBs outside temp/test contexts.
- Adoption targets: source CLI/read model, package support scripts, operations docs.
- Live mutation policy: metrics read runtime state; operations docs do not mutate live profiles.
- Required evidence: metrics status fixture, degraded/stale/blocking state fixture, low-score trace linkage fixture, operations runbook review.
- Conflicts: manual report metrics, invisible degraded runtime, metrics without thresholds, release claims with blocker metrics.
- Staged paths: runtime status CLI/store, runtime-control-plane docs, observability tests.
- Closure traceability: metrics status JSON, threshold evaluation output, operations runbook review.

## Required Work

- Add metrics to runtime status/read model:
  - `completion_false_positive_rate`
  - `run_resume_success_rate`
  - `tool_invalid_call_rate`
  - `prompt_cache_hit_ratio`
  - `context_compaction_ratio`
  - `db_busy_timeout_count`
  - `browser_trace_flaky_rate`
  - `security_open_alerts`
  - `eval_regression_worsened_count`
  - `memory_promotion_rollback_count`
- Surface active runs, stale leases, degraded runtime, blocking events, pending approvals, and eval regressions.
- Add operations runbook for diagnosing degraded states.
- Feed low-score traces into the improvement loop.

## Acceptance Criteria

- Runtime status makes degraded/stale/blocking states visible.
- Metrics are collected from runtime evidence, not hand-written reports.
- Operations docs explain recovery and rollback.
- Improvement loop can point from metric regression to trace/eval evidence.

## Metric Threshold Policy

| Metric | Warning | Blocker | Release blocker |
|---|---|---|---|
| `completion_false_positive_rate` | any non-zero candidate | any confirmed non-zero value | yes |
| `eval_regression_worsened_count` | any worsened non-required suite | any worsened required suite | yes |
| `security_open_alerts` | any medium alert | any high/critical alert or missing required scan | yes |
| `run_resume_success_rate` | below phase threshold | below release threshold | yes for release phases |
| `tool_invalid_call_rate` | above baseline | above threshold or rising trend | no unless tied to required eval |
| `prompt_cache_hit_ratio` | below target | no direct blocker | no |
| `context_compaction_ratio` | outside expected range | loss of required resume fields | yes when resume fields are lost |
| `db_busy_timeout_count` | repeated busy waits | lock timeout causing authority failure | yes when authority is unavailable |
| `browser_trace_flaky_rate` | above baseline | required browser evidence flaky/unreproducible | yes for browser-required releases |
| `memory_promotion_rollback_count` | any rollback trend | rollback on required promoted knowledge | no unless stale memory affects authority |

## Regression Contract

- Runtime status exposes active runs, stale leases, degraded runtime, blocking events, pending approvals, and eval regressions.
- Metrics are derived from runtime events/decisions/eval results rather than manual reports.
- Degraded/stale/blocking states prevent clean completion claims.
- Low-score trace linkage points to eval or improvement-loop evidence.

## Completion Evidence

- `npm test`
- Runtime status metrics fixture
- Degraded/stale/blocking state fixture
- Operations runbook review
