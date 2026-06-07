# Phase 08 - Eval Regression, AWTL Replay, and Trace-to-Testcase v2

## Goal

Make harness changes measurable and block regressions in completion authority, tool choice, sandbox behavior, context resume, and verification freshness.

## Execution Metadata

- Dependencies: Phase 02, Phase 05, Phase 06, Phase 07.
- Owned paths: `tools/evals/**`, `tools/awtl/**`, planned `tools/awtl/trace-to-testcase.mjs`, `scripts/knowledge-improvement-lifecycle.mjs`, planned `scripts/lib/awtl-memory-candidate.mjs`, `scripts/lib/runtime-state-store.mjs`, `schemas/awtl-testcase-candidate-v1.schema.json`, planned `schemas/improvement-candidate-v1.schema.json`, `tests/fixtures/harness-control-plane/**`, `tests/tool-sandbox-eval-contract.test.mjs`, `tests/harness-regression-contract.test.mjs`, planned `tests/eval-regression-contract.test.mjs`, `docs/public/guidelines/external-skill-pattern-transfer.md`.
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
- Define `ImprovementCandidateV1` as a candidate extension of the existing AWTL trace-to-testcase flow, not as a source mutation mechanism.
- Require candidate states such as `pending_review` or `ready_for_review`; a PASS verdict can move a candidate to review readiness but cannot auto-edit schemas, ontology, public skills, agents, tool permissions, or verification contracts.
- Keep improvement loop review sidecars separate from runtime memory promotion and from the plan-review independent-agent loop.
- Define promotion review and rollback rules for new eval cases.

## Acceptance Criteria

- Worsened eval results block accepted completion.
- Golden regression suite runs through a named command and required check; documentation alone is not sufficient for release claims.
- Low-score traces can produce reviewed candidate fixtures.
- Eval artifacts are evidence, not source authority.
- PASS/FAIL/INCONCLUSIVE or equivalent eval verdicts block or advance candidate review state only; parent/manual accepted edits are required before source changes.

## Regression Contract

- Completion false-positive, stale verdict, missing identity, wrong tool, invalid schema, out-of-scope write, stale lease, degraded runtime, and eval worsening fixtures stay in the golden suite.
- Worsened eval results block accepted completion.
- Low-score traces produce candidate testcase artifacts with review and rollback metadata.
- Eval artifacts remain generated evidence and never source authority.
- The eval gate has a named command, fixture namespace, score threshold, required check name, and release-blocking failure behavior.
- Trace-to-testcase and improvement candidates cannot mutate source without an accepted parent edit and fresh regression evidence.

## Completion Evidence

- `npm test`
- `npm run test:eval` or the active equivalent command documented in the phase closeout
- AWTL replay scorecard
- Trace-to-testcase candidate output
- ImprovementCandidateV1 candidate output showing no automatic source mutation
- Promotion/rollback audit output
