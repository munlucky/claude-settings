# Implementation Wave Map v2

## Purpose

This map prevents the current implementation from being overstated. It names what has been implemented as Wave 1 foundation, what is in progress, and what remains for full v2 modernization.

## Wave 1 - Foundation Already Implemented or Staged

| Area | Status | Evidence owner |
|---|---|---|
| Runtime SQLite dependency | Implemented in source | `package.json`, `package-lock.json` |
| Runtime store and CLI | Implemented foundation | `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs` |
| DB schema and migrations | Implemented foundation | Runtime control-plane contract tests |
| Completion authority | Implemented foundation | Completion authority contract tests |
| Runtime read model | Implemented foundation | Runtime read-model contract tests |
| Run/goal/workspace identity | Implemented foundation | Runtime control-plane and phase-runner tests |
| Resume snapshot on non-dry-run preparation | Implemented foundation | `prepare-phase-runner-state.mjs` tests |
| Tool-call/eval recording | Implemented foundation | Tool/sandbox/eval contract tests |
| CI/security source config | Implemented source config | `.github/**` and CI contract tests |
| Package generated-state exclusion | Implemented foundation | package materialization/package layout tests |

## Wave 1 - Known Limitations

- Live account-root adoption is not claimed by Wave 1 or Wave 2; it remains controlled rollout work under Phase 11.
- Runtime leases do not yet include heartbeat/TTL/recovery cleanup.
- `eval_results` exists, but the AWTL replay/promotion gate is not fully wired.
- Tool and sandbox events can block completion, but there is no complete dispatcher/sandbox compute plane.
- Context read model exists, but not the full compaction/rehydration/prompt assembly engine.

## Wave 2 - Dependency and Runtime Availability Hardening

Status: in progress; source/package/temp-home evidence collected locally on 2026-06-07, but phase closeout has not been accepted.

| Area | Status | Evidence owner |
|---|---|---|
| Packaged runtime dependency materialization | Evidence collected locally | `package/package-contract.yaml`, `tests/package-materialization.test.mjs`, `node package/build-package.mjs --runtime all --dry-run --json` |
| Source runtime-state smoke | Evidence collected locally | `node scripts/runtime-state.mjs status --json` with temp `PHASE_RUNTIME_DB` |
| Temp-home installed runtime-state smoke | Evidence collected locally | `node scripts/install-account-root-harness.mjs --runtime all --moonshot-home <temp> --claude-home <temp> --codex-home <temp>` followed by installed `scripts/runtime-state.mjs status --json` |
| Typed degraded native dependency behavior | Evidence collected locally | Runtime control-plane, read-model, package materialization, and tool/sandbox eval contract tests |
| OS/Node matrix source config | Implemented as source config | `.github/workflows/ci.yml` covers Node 20.x and 22.x on Ubuntu, Windows, and macOS |

Remaining release evidence:

- Remote GitHub CI matrix results must be attached before release/native rollout claims.
- Live account-root adoption remains Phase 11 work and requires explicit approval plus state preservation evidence.
- Phase closeout has not been accepted yet; do not treat this wave as completed from evidence collection alone.

## Wave 3 - Context, Tool, and Sandbox Core

Required implementation:

- Context State Engine object model.
- Compaction and rehydration commands.
- Prompt assembly with stable prefix and volatile tail.
- Tool Registry/Dispatcher with 10 to 12 public groups.
- Lazy schema loading and schema budget metrics.
- Leased worktree/shell/browser sandbox boundary.
- Artifact collector and protected path enforcement.

## Wave 4 - Verification, Eval, Trace, and Memory

Required implementation:

- AWTL replay suite for harness-control-plane fixtures.
- Completion false-positive, stale verdict, wrong-tool, out-of-scope write, and degraded-runtime fixtures.
- Playwright/browser trace capture standardization for browser-verifier flows.
- Trace-to-testcase candidate generation.
- Memory promotion ledger with evidence, review, replay, rollback, and stale-warning rules.

## Wave 5 - CI, Security, Release, and Downstream

Required implementation:

- GitHub branch protection and required checks applied outside source.
- CodeQL/dependency review/Dependabot findings consumed by release gate.
- Secret scanning policy documented as an operational requirement.
- Release runbook for package/account-root/downstream adoption.
- Downstream smoke fixtures proving installed runtime parity.

## Wave 6 - Observability and Continuous Improvement

Required implementation:

- Runtime metrics emitted by `status --json`.
- Metrics: `completion_false_positive_rate`, `run_resume_success_rate`, `tool_invalid_call_rate`, `prompt_cache_hit_ratio`, `context_compaction_ratio`, `db_busy_timeout_count`, `browser_trace_flaky_rate`, `security_open_alerts`, `eval_regression_worsened_count`, and `memory_promotion_rollback_count`.
- Operations view for active runs, stale leases, degraded runtime capability, blocking events, eval regressions, and pending approvals.
- Periodic improvement loop that turns low-score traces into reviewed regression candidates.
