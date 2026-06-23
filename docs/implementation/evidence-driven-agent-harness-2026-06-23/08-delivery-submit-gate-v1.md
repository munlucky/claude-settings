# Phase 08 - Delivery Submit Gate v1

## Objective

Implement explicit delivery submission policy without allowing push, PR, release, or close from stale or non-FULL candidate evidence.

## Dependencies

- Phase 04.
- Phase 05.
- Phase 06.
- Phase 07.

## Owned Paths

- `schemas/submission-receipt.schema.json`
- `scripts/delivery-submit.mjs`
- `scripts/lib/delivery-policy.mjs`
- `bin/moonshot-relay.mjs`
- `tests/delivery-submit-contract.test.mjs`
- `tests/fixtures/delivery-submit/`

## Read-only Paths

- `package/runtime-surface.json`
- `package/package-contract.yaml`
- Existing account-root state under `${MOONSHOT_RELAY_HOME}`.
- Live `.claude` and `.codex` profiles unless explicit adoption is requested.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P08-1 | Decide CLI integration point: `bin/moonshot-relay.mjs delivery submit` or source support script wrapper. | Delivery command contract |
| P08-2 | Implement local, PR, and release delivery policy modes. | Delivery policy |
| P08-3 | Record `submission.json` with source/review/verify/score SHA alignment. | Submission receipt |
| P08-4 | Block push/PR/release when candidate evidence is stale or not FULL. | Negative tests |

## Acceptance Criteria

- FULL is required before submit/close.
- Submitted SHA must match reviewed, verified, and scored SHA.
- Delivery command does not mutate source after scoring.
- Live account-root sync is separate and explicitly approved.

## Verification Signals

- `node --test tests/delivery-submit-contract.test.mjs`
- `npm run test:lab`
- `npm test`

## Review-Improvement Loop

- Review focus: accidental publish, stale SHA, live profile mutation.
- Re-review trigger: delivery command or publish behavior changes.

## Phase 08 Closeout

Status: complete

Implemented:
- Added delivery policy module requiring FULL score, passed verification, candidate binding, and reviewed/verified/scored/submitted SHA alignment.
- Added `scripts/delivery-submit.mjs submit` to produce `SUBMISSION_RECEIPT` without pushing, opening PRs, releasing, or mutating source.
- Added `moonshot-relay delivery submit` bin routing to the source support script.
- Extended submission receipt schema with anti-staleness SHA fields and source-mutation guard fields.
- Added delivery submit fixture placeholder and contract tests for allowed, non-FULL, stale binding, SHA mismatch, CLI write, and bin routing behavior.

Verification:
- `node --test tests\delivery-submit-contract.test.mjs tests\receipt-schema-contract.test.mjs tests\syntax-schema-contract.test.mjs`
- `node --check scripts\delivery-submit.mjs; node --check scripts\lib\delivery-policy.mjs; node --check bin\moonshot-relay.mjs`
- `node -e "...package test file existence check..."`
