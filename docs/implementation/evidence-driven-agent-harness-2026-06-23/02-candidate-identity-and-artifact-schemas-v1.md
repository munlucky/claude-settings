# Phase 02 - Candidate Identity and Artifact Schemas v1

## Objective

Create source-bound schemas and helpers for `candidate_id`, artifact digests, and stale evidence rejection across review, verify, score, submit, and close.

## Dependencies

- Phase 01.

## Owned Paths

- `schemas/candidate-identity.schema.json`
- `schemas/run-receipt.schema.json`
- `schemas/review-receipt.schema.json`
- `schemas/verification-receipt.schema.json`
- `schemas/score-receipt.schema.json`
- `schemas/submission-receipt.schema.json`
- `scripts/lib/candidate-identity.mjs`
- `tests/candidate-identity-contract.test.mjs`
- `tests/receipt-schema-contract.test.mjs`
- `tests/fixtures/candidate-identity/`

## Read-only Paths

- `schemas/verification.contract.yaml`
- `scripts/lib/runtime-state-store.mjs`
- `scripts/verification-plane.mjs`
- `tools/harness-lab/harness-lab.mjs`

## Live Mutation Policy

Source checkout only. Generated evidence fixtures may be committed only under reviewed test fixture paths.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P02-1 | Define candidate identity inputs and normalization rules. | Candidate ID contract |
| P02-2 | Define canonical serialization, digest format, git tree command, and environment allowlist. | Deterministic ID helper contract |
| P02-3 | Add schemas for review, verify, score, submission, and run receipt source blocks. | JSON schemas |
| P02-4 | Add stale evidence detection helpers. | Source-binding utility |
| P02-5 | Add negative tests for mismatched candidate/source digests. | Contract tests |

## Acceptance Criteria

- `candidate_id` includes task/spec/plan/done/source/environment dimensions or an explicitly documented reduced profile.
- Stable canonical serialization produces the same candidate_id for unchanged inputs.
- Source, spec, plan, done, lockfile, or environment digest changes invalidate old candidate evidence.
- Snake-case `candidate_id` and existing camelCase `candidateId` interop is decided in schema tests and normalized at boundaries.
- `review.json`, `verify.json`, `score.json`, and `submission.json` cannot be considered mutually consistent when candidate or source digests differ.
- Existing runtime-state completion authority is not weakened.
- H0 lab output remains outside candidate-controlled evidence.

## Verification Signals

- Targeted candidate schema/helper tests.
- `npm run test:lab`
- `npm test`

## Review-Improvement Loop

- Review focus: stale evidence bypasses, ambiguous digest inputs, schema compatibility.
- Re-review trigger: any change to candidate digest fields or completion authority wording.

## Phase 02 Closeout

Status: complete

Completion evidence:

- `schemas/candidate-identity.schema.json`
- `schemas/run-receipt.schema.json`
- `schemas/review-receipt.schema.json`
- `schemas/verification-receipt.schema.json`
- `schemas/score-receipt.schema.json`
- `schemas/submission-receipt.schema.json`
- `scripts/lib/candidate-identity.mjs`
- `tests/candidate-identity-contract.test.mjs`
- `tests/receipt-schema-contract.test.mjs`
- `tests/fixtures/candidate-identity/README.md`
- `execution/phase-02/SCORECARD.md`
- `execution/phase-02/QA_REPORT.md`
- `execution/phase-02/HANDOFF.md`

Execution decision:

- Phase 03 may consume `candidate_id`, `candidateId`, digest normalization, and stale evidence comparison helpers.
- Existing runtime-state completion authority is unchanged.
