# Phase 03 - Completion Authority and Derived Artifacts v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Cut over clean-finish semantics so accepted runtime DB completion decisions are authoritative while existing verdict and markdown artifacts remain compatibility projections.

## Owned Paths

- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `scripts/verification-verdict-state.mjs`
- `skills/completion-verifier/SKILL.md`
- `skills/completion-verifier/SKILL.ko.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`
- `schemas/verification.contract.yaml`
- `tests/completion-authority-contract.test.mjs`

## Read-Only / Preserved Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- account-root homes
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files except temp fixture data created by this phase's tests

## Dependencies

- Phase 02 complete.

## Implementation Work

- Define `assessCompletionAuthority()` rules:
  - accept only latest matching `completion_decisions.status = accepted`
  - reject phase-status-only completion
  - reject stale/superseded verdict evidence
  - reject missing identity when active identity is available
  - reject blocking workflow warnings
  - reject unauthorized approval-required operation events
  - reject `regression_worsened=true` eval results
  - return `needs_more_evidence` for missing required verifier evidence
- Restrict accepted decision writes:
  - normal `accepted` decisions are produced by `assess-completion` after validation
  - `record-completion` can write `rejected` or `needs_more_evidence`
  - manual accepted repair requires writer identity, evidence hash, approval ID, and explicit repair mode
- Implement supersede/revoke behavior for stale or bad accepted decisions.
- Reconcile verdict JSON as input evidence, not final authority.
- Update verifier/orchestrator docs to say completion-verifier writes or requests evidence-backed decisions.
- Keep compatibility with existing verdict reader and phase closeout paths.
- Update derived artifacts so verdict JSON, QA report, scorecard, and handoff include `authoritySource`, `decisionId`, `evidenceHash`, and `stale` when runtime authority is available.

## Acceptance Criteria

- Clean finish cannot be claimed from chat output, `phase-status.yaml`, QA report, handoff, or verdict JSON alone.
- Fresh verifier evidence with matching identity can produce an accepted decision.
- Existing compatibility readers still parse old verdict artifacts without treating them as final authority.
- Superseded or revoked accepted decisions cannot satisfy clean finish.
- Unauthorized approval-required operations and worsened eval regressions block clean finish.

## Regression Contract

Add `tests/completion-authority-contract.test.mjs`.

Required test cases:

- `phase-status.yaml` says complete but no DB accepted decision -> rejected.
- stale verdict with superseded marker -> rejected.
- missing identity while active identity is present -> rejected.
- fresh matching evidence -> accepted.
- blocking workflow warning -> not accepted.
- manual accepted write without approval ID -> downgraded or rejected.
- superseded accepted decision -> not accepted.
- projection artifacts expose authority metadata and stale state.

## Completion Evidence

- `node --test tests/completion-authority-contract.test.mjs`
- `npm test`
- `git diff --check`
