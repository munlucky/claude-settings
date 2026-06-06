# Phase 08 - Eval Regression, AWTL Replay, and Trace-to-Testcase v2

## Goal

Make harness changes measurable and block regressions in completion authority, tool choice, sandbox behavior, context resume, and verification freshness.

## Execution Metadata

- Dependencies: Phase 02, Phase 05, Phase 06, Phase 07.
- Owned paths: `tools/evals/**`, `tools/awtl/**`, `scripts/lib/runtime-state-store.mjs`, `tests/fixtures/harness-control-plane/**`, `tests/tool-sandbox-eval-contract.test.mjs`, `tests/harness-regression-contract.test.mjs`, `docs/public/guidelines/external-skill-pattern-transfer.md`.
- Read-only paths: generated AWTL traces, scorecards, browser traces, runtime DBs outside temp/test state.
- Adoption targets: source eval fixtures and CI-required eval gate.
- Live mutation policy: no live profile mutation; eval artifacts remain generated evidence.
- Required evidence: golden regression run, worsened eval blocker fixture, trace-to-testcase candidate fixture, promotion/rollback audit fixture.
- Conflicts: documented eval gate without executable command, eval artifacts promoted as source authority, worsened eval accepted as completion.
- Staged paths: eval runner, AWTL fixture namespace, harness regression fixtures, eval tests.
- Closure traceability: eval command output, scorecard, trace-to-testcase candidate, promotion/rollback audit.

## Required Work

- Add harness-control-plane fixture namespace under existing AWTL replay/promotion structure.
- Include fixtures for completion false positive, stale verdict, phase-status-only completion, missing identity, wrong tool, invalid schema, out-of-scope write, stale lease, degraded runtime, and eval worsening.
- Store scorecards in `eval_results`.
- Add trace-to-testcase candidate generation for low-score or failed traces.
- Define promotion review and rollback rules for new eval cases.

## Acceptance Criteria

- Worsened eval results block accepted completion.
- Golden regression suite runs through a named command and required check; documentation alone is not sufficient for release claims.
- Low-score traces can produce reviewed candidate fixtures.
- Eval artifacts are evidence, not source authority.

## Regression Contract

- Completion false-positive, stale verdict, missing identity, wrong tool, invalid schema, out-of-scope write, stale lease, degraded runtime, and eval worsening fixtures stay in the golden suite.
- Worsened eval results block accepted completion.
- Low-score traces produce candidate testcase artifacts with review and rollback metadata.
- Eval artifacts remain generated evidence and never source authority.
- The eval gate has a named command, fixture namespace, score threshold, required check name, and release-blocking failure behavior.

## Completion Evidence

- `npm test`
- `npm run test:eval` or the active equivalent command documented in the phase closeout
- AWTL replay scorecard
- Trace-to-testcase candidate output
- Promotion/rollback audit output
