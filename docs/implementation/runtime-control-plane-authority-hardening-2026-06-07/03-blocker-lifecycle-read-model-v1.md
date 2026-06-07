# Phase 03 - Blocker Lifecycle Read Model

## Goal

Replace one-way blocking events with an event-backed blocker lifecycle that can be opened, resolved, superseded, or reopened.

## Dependencies

- Phase 01 closeout model.
- Phase 02 identity taxonomy.

## Owned Paths

- `scripts/lib/runtime-state-store.mjs`
- `scripts/runtime-state.mjs`
- `tests/runtime-read-model-contract.test.mjs`
- optional new `tests/blocker-lifecycle-contract.test.mjs`

## Read-Only Paths

- generated projection artifacts
- live runtime state outside test temp DBs

## Required Decisions

- Use event-backed lifecycle first; do not add a blocker table unless event fingerprint matching proves insufficient.
- Canonical event types: `blocker.opened`, `blocker.resolved`, `blocker.superseded`, `blocker.reopened`.
- Each blocker event must include a stable blocker fingerprint.
- Latest unresolved blocker determines `compactStatus.currentBlocker`.

## Implementation Notes

- A resolved blocker must stop blocking `assess-completion` only when the resolution event matches the blocker fingerprint.
- Superseded blockers remain audit history but no longer block.
- Reopened blockers become active again and should appear in stale/current blocker warnings as appropriate.

## Acceptance Evidence

- RED/GREEN fixture: unresolved blocker rejects completion.
- RED/GREEN fixture: matching `blocker.resolved` clears the blocker and allows later evidence assessment.
- RED/GREEN fixture: unrelated resolution does not clear a different blocker.
- `status --json` exposes enough data to explain current blocker and next action without reading projection files.
