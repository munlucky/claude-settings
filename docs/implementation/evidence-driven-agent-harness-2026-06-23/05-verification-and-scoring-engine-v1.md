# Phase 05 - Verification and Scoring Engine v1

## Objective

Make `verify.json` and `score.json` deterministic, source-bound, and policy-controlled so completion cannot be claimed from stale or incomplete evidence.

## Dependencies

- Phase 02.
- Phase 04.

## Owned Paths

- `schemas/**verification**`
- `schemas/**score**`
- `scripts/verification-plane.mjs`
- `scripts/lib/verification-plane.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `tests/verification-plane-contract.test.mjs`
- `tests/completion-authority-contract.test.mjs`
- `tests/*score*`

## Read-only Paths

- `docs/public/runtime-control-plane.md`
- `schemas/verification.contract.yaml`
- `tools/evals/harness-control-plane.mjs`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P05-1 | Define command evidence schema with argv, cwd, env allowlist, timeout, exit code, and artifact digests. | Verification evidence schema |
| P05-2 | Bind verification evidence to candidate/source/environment digest. | Verify helper |
| P05-3 | Define hard gates, weighted score, policy version, and thresholds. | Scoring policy |
| P05-4 | Project verify/score results into verification-plane/runtime-state evidence without bypassing runtime-state completion decisions. | Authority integration |
| P05-5 | Block FULL when hard gate or critical review finding fails. | Completion tests |

## Acceptance Criteria

- `verify.json` records actual command outcomes, not natural-language claims.
- `score.json` includes policy version and every artifact digest used for scoring.
- Score cannot override a hard gate failure.
- Current runtime-state accepted completion semantics remain intact; JSON artifacts alone cannot close whole-plan completion.
- `score.status=FULL` is submit eligibility only; whole-plan closeout still requires an accepted `completion_decisions` row produced by runtime-state assessment.
- Verification evidence projection names writer commands, event type, and evidence payload shape before implementation.

## Verification Signals

- Targeted verification/scoring tests.
- `node scripts/verification-plane.mjs record-summary ...` fixture-based projection test.
- `node scripts/runtime-state.mjs assess-completion --json` negative test proving JSON score alone is insufficient.
- `npm run test:eval`
- `npm test`

## Review-Improvement Loop

- Review focus: score inflation, stale verification reuse, environment digest gaps.
- Re-review trigger: any change to completion authority or required verification planes.

## Phase 05 Closeout

Status: complete

Completion evidence:

- `schemas/verification-evidence.schema.json`
- `schemas/score-policy.schema.json`
- `scripts/verification-plane.mjs`
- `scripts/lib/verification-plane.mjs`
- `tests/score-policy-contract.test.mjs`
- `tests/verification-plane-contract.test.mjs`
- `tests/completion-authority-contract.test.mjs`
- `execution/phase-05/SCORECARD.md`
- `execution/phase-05/QA_REPORT.md`
- `execution/phase-05/HANDOFF.md`

Execution decision:

- Phase 06 may project receipts and score events into durable event/replay state.
- `score.status=FULL` is submit eligibility only and does not create whole-plan completion authority.
