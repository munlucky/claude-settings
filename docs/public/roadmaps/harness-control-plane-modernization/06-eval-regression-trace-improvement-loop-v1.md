# Phase 06 - Eval Regression, Trace, and Improvement Loop v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Turn harness regressions into executable eval fixtures and connect AWTL trace/replay evidence to runtime control-plane decisions.

## Owned Paths

- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `scripts/awtl-memory-promotion.mjs`
- `scripts/commit-moonshot-promotion-audit.mjs`
- `scripts/lib/awtl-replay-scorecard.mjs`
- `scripts/lib/awtl-replay-probes.mjs`
- `scripts/lib/awtl-trace-sink.mjs`
- `schemas/awtl-event-v1.schema.json`
- `schemas/awtl-failed-turn-case-v1.schema.json`
- `schemas/verification.contract.yaml`
- `tests/tool-sandbox-eval-contract.test.mjs`
- `tests/fixtures/harness-control-plane/**`

## Read-Only / Preserved Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- account-root homes
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files except temp fixture data created by this phase's tests

## Dependencies

- Phase 02 complete.
- Phase 03 complete.
- Phase 05 complete.

## Implementation Work

- Implement `recordEvalResult()` in runtime store and CLI.
- Define eval suites:
  - `completion-authority`
  - `runtime-read-model`
  - `tool-selection`
  - `sandbox-safety`
  - `package-boundary`
- Add golden regression fixtures for:
  - phase-status-only false completion
  - stale verdict acceptance
  - missing identity acceptance
  - out-of-scope write
  - wrong-tool/schema escalation
- Connect AWTL replay scorecard results to `eval_results`.
- Keep MemoryGraph promotion gated by replay or explicit approval; runtime eval result is evidence, not automatic memory write.
- Define the active suite command that owns these fixtures, and add it to `npm test` rather than relying on archive or ad hoc runners.
- Treat `regression_worsened=true` as a blocking completion and promotion fact.

## Acceptance Criteria

- Eval result records include suite, status, score JSON, regression flag, and evidence JSON.
- Regression-worsened result blocks promotion and clean completion.
- AWTL replay remains compatible with existing promotion audit behavior.
- Harness control-plane fixtures live under a named namespace and do not broaden ownership to all `tests/fixtures/**`.

## Regression Contract

Extend active tests rather than reviving legacy archive runners as default gates.

Required test cases:

- `regression_worsened=true` blocks authority acceptance.
- Passing eval result appears in runtime status.
- Replay scorecard degraded/missing is surfaced as warning or blocker according to profile.
- `npm test` includes the active eval regression contract.

## Completion Evidence

- Targeted eval regression test
- `npm test`
- `node scripts/commit-moonshot-promotion-audit.mjs --json`
