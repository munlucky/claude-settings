# Phase 06 - Workspace, Execution, and Event Ledger v1

## Objective

Add durable execution receipts, worktree lease semantics, append-only event ledger, and resume reconstruction while remaining compatible with current `runtime_events` and runtime-state read models.

## Dependencies

- Phase 02.
- Phase 03.
- Phase 05.

## Owned Paths

- `scripts/**workspace**`
- `scripts/**event**`
- `scripts/**receipt**`
- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `tests/runtime-control-plane-contract.test.mjs`
- `tests/*event*`
- `tests/*workspace*`

## Read-only Paths

- `docs/public/runtime-control-plane.md`
- `tools/harness-lab/harness-lab.mjs`
- `package/package-contract.yaml`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P06-1 | Define `RunReceipt` and command receipt schemas. | Receipt contracts |
| P06-2 | Decide authoritative event writer and projection direction between hash-chained JSONL and runtime_events. | Event compatibility contract |
| P06-3 | Implement append-only event JSONL with previous-event hash only after P06-2 is accepted. | Event ledger |
| P06-4 | Add workspace lease and cleanup policy for source worktrees. | Workspace manager |
| P06-5 | Reconstruct status/resume from artifacts and event ledger after index deletion. | Resume tests |

## Acceptance Criteria

- Event hash chain detects tampering or missing events.
- Event writer/projection rules do not create split-brain state between JSONL and `runtime_events`.
- Current `runtime_events` remains authoritative for runtime-state read models; JSONL is a receipt/replay mirror unless a later ADR changes that decision.
- Resume computes next transition from valid events and artifacts, not from last string status alone.
- Dirty/untracked/secret workspace state blocks safe lease return.
- SQLite remains rebuildable index/control plane.

## Verification Signals

- Event ledger and resume tests.
- Runtime-state regression tests.
- `npm test`

## Review-Improvement Loop

- Review focus: destructive cleanup, unreconstructable state, unsafe lease reuse.
- Re-review trigger: reset/clean policy, event hash schema, or runtime-state DB semantics change.

## Phase 06 Closeout

Status: complete

Completion evidence:

- `scripts/lib/event-ledger.mjs`
- `scripts/lib/workspace-manager.mjs`
- `scripts/workspace-manager.mjs`
- `tests/event-ledger-contract.test.mjs`
- `tests/workspace-manager-contract.test.mjs`
- `tests/runtime-control-plane-contract.test.mjs`
- `tests/runtime-read-model-contract.test.mjs`
- `execution/phase-06/SCORECARD.md`
- `execution/phase-06/QA_REPORT.md`
- `execution/phase-06/HANDOFF.md`

Execution decision:

- Phase 07 may use event/resume helpers for plan graph and scope drift enforcement.
- JSONL remains a receipt/replay mirror; runtime-state read models remain authoritative.
