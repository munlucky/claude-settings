# Phase Runner Reconciliation Resolved Evidence Guard

## Summary

This package closes the remaining P1 contract gap in the simple state board work: same-attempt `blocked -> active` reconciliation must not be accepted from an open blocker record.

The fix is intentionally small. `STATE.md`, run identity, terminal publisher wiring, and compatibility projection scrub stay as implemented. The only behavioral change is that a same-attempt blocked resume requires a machine-checkable resolved blocker append plus exact reconciliation intent fields.

## Source Finding

Current review finding:

- `validateReconciliationIntent()` accepts a blocker evidence id when it merely exists in `BLOCKER_EVIDENCE.jsonl`.
- The function does not currently enforce `intent`, `resumeReason`, or `attemptId`.
- `assessWorkerSpawnStateGuard()` then treats that helper success as permission to spawn the same attempt.
- A fixture with `status: "open"` evidence, matching manifest hash, and a valid-looking intent reproduced the bypass.

## Goals

- Prevent same-attempt `blocked -> active` resume unless blocker resolution evidence is explicit and machine-checkable.
- Keep terminal publisher behavior unchanged: blocked publication writes open blocker evidence; resolution is a separate append.
- Add regression tests that fail on the current open-only bypass.
- Preserve new-attempt behavior and the existing state board/projection contract.

## Non-Goals

- No new state store, SQLite schema, or event-sourcing layer.
- No auto-resolution from mtime, file hash changes, or free-form reason text.
- No broad refactor of terminal publishing or phase runner lifecycle.
- No change to `BLOCKER_EVIDENCE.jsonl` as canonical terminal evidence.

## Requirements

### REQ-1: Strict Reconciliation Intent Fields

`validateReconciliationIntent()` must reject an intent unless all required fields match the current transition context:

- `intent === "resume_blocked_attempt"`
- `resumeReason === "blocker_resolved"`
- `stateRunId`
- `attemptId`
- `transactionId`
- `blockerEvidenceId`
- `projectionManifestSha256`

`attemptId` must be supplied by the runner validation path, not inferred from the intent itself.

### REQ-2: Resolved Evidence Requirement

`BLOCKER_EVIDENCE.jsonl` validation must move from "id exists" to "resolved record exists".

A valid resolved record must have:

- same `id` as `blockerEvidenceId`
- `status === "resolved"`
- same `transactionId`
- same `attemptId`
- same `stateRunId`

If only open blocker records exist, validation must fail with a stable code such as `reconciliation_intent_blocker_not_resolved`.

### REQ-3: Runner Spawn Guard Coverage

The runner same-attempt spawn guard must pass `attemptId` into reconciliation validation and must reject:

- blocked board + same attempt + valid-looking intent + open-only blocker evidence
- blocked board + same attempt + mismatched intent `attemptId`
- blocked board + same attempt + mismatched resolved evidence transaction

The guard may allow:

- blocked board + same attempt + exact reconciliation intent + resolved blocker evidence
- blocked board + different attempt, subject to existing transition rules

### REQ-4: Regression Verification

The implementation must have fresh evidence from focused tests and no diff hygiene failures.

Required commands:

```powershell
node --test .claude/scripts/lib/simple-run-state.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs
node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs
git diff --check
```

## Phase Plan

| Phase | Document | Purpose | Parallel |
| --- | --- | --- | --- |
| 1 | `01-reconciliation-intent-resolved-evidence-guard-v1.md` | Tighten reconciliation validation and add regression tests. | No |

## Acceptance Criteria

- AC-1: `validateReconciliationIntent()` rejects missing or wrong `intent`.
- AC-2: `validateReconciliationIntent()` rejects missing or wrong `resumeReason`.
- AC-3: `validateReconciliationIntent()` rejects mismatched `attemptId`.
- AC-4: Open-only blocker evidence no longer permits same-attempt resume.
- AC-5: Resolved blocker evidence with matching intent permits same-attempt resume.
- AC-6: Runner spawn guard rejects the open-only bypass before `runWorkerPrompt`.
- AC-7: Terminal publisher tests still pass without changing open blocker publish semantics.
- AC-8: Missing `options.attemptId` and missing `intent.attemptId` are rejected.
- AC-9: Runner guard exposes reconciliation validation error code as `detailCode`.
- AC-10: Multiple JSONL records pass only when one resolved record matches `id`, `status`, `transactionId`, `attemptId`, and `stateRunId` together.

## Execution Notes

- Keep changes surgical. The implementation surface should be limited to the reconciliation helper, runner option plumbing, and tests.
- Prefer small helper functions in `simple-run-state.mjs` over duplicating JSONL parsing in the runner.
- Use stable error codes because the runner guard and tests need deterministic diagnostics.
- Do not accept missing `attemptId` or `stateRunId` in reconciliation intent or resolved blocker evidence. A same-attempt resume is an explicit recovery path, so legacy open evidence is not enough.

## Review Loop Status

Controller draft status: ready for independent plan review.

Loop artifacts:

- `planning-loop/controller-state.yaml`
- `planning-loop/plan-quality-review-iter-01.yaml`
- `planning-loop/plan-writer-revision-iter-01.yaml`
