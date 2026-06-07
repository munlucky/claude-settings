# Phase 01 - Authority Matrix And Closeout Model

## Goal

Define the workflow path to DB authority matrix and remove ambiguity between phase closeout and whole-plan closeout.

## Dependencies

- None.

## Owned Paths

- `docs/public/runtime-control-plane.md`
- `docs/public/reference/phase-runner-user-workflow.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `skills/moonshot-in-session-coordinator/SKILL.md`
- `tests/runtime-control-plane-contract.test.mjs`
- `tests/workflow-e2e-contract.test.mjs`

## Read-Only Paths

- `.moonshot-relay/**`
- `.claude/**`
- `.codex/**`
- runtime DB/WAL/SHM files
- verifier JSON, QA reports, scorecards, handoffs, and `phase-status.yaml`

## Required Decisions

- Treat phase closeout as phase-local evidence only.
- Treat whole-plan closeout as the only path that can require `completion_decisions.status=accepted`.
- Keep projections readable, but forbid them from becoming authority.
- Publish the master plan authority matrix in `docs/public/runtime-control-plane.md`.

## Implementation Notes

- Update phase-runner and coordinator wording so phase-local rejected review findings become carry-forward runtime/eval evidence, not automatic whole-plan failure.
- Keep existing rule that final whole-plan success requires `assess-completion` accepted.
- If a document uses `completionEligible`, define it as eligibility to attempt assessment, not proof of completion.

## Acceptance Evidence

- `tests/workflow-e2e-contract.test.mjs` proves phase runner docs separate phase closeout from whole-plan closeout.
- `tests/runtime-control-plane-contract.test.mjs` or `tests/runtime-read-model-contract.test.mjs` proves projection-only completion remains insufficient.
- `rg -n "phase closeout|whole-plan closeout|runtime-state.sqlite" docs/public/runtime-control-plane.md skills/moonshot-phase-runner/SKILL.md`.
