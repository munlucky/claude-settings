# Phase 05: Event Ledger And Replay Read Model (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-007 | User strategy Phase 4 | Add append-only event ledger or SQLite events | Add minimal event ledger beside existing read models |
| OHA-014 | Additional improvements | Add contract change ledger and execution-vs-evaluation guide | Encode contract/change/evaluation events and docs |

## Goal

- Add event lineage without replacing current phase status, current-run, active-run, latest-dispatch, QA_REPORT, and verdict read models.

## Expected Outcome

- Mutable status artifacts remain fast read models.
- Event ledger provides append-only replay for postmortem, resume, stale-state diagnosis, and verifier reconciliation.
- Contract changes, ambiguity evaluations, workset transitions, verification results, retries, recovery, and closeout normalization become durable events.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "01"
    - "03"
    - "04"
  conflictsWith:
    - "06"
    - "07"
    - "08"
  ownedPaths:
    - ".claude/scripts/lib/"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/docs/guidelines/"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/05-event-ledger-replay-read-model-v1.md"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/"
    - ".claude/docs/phase-status.yaml"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths:
    - ".claude/logs/workflow-enforcement/"
  requiresManualEvidence: false
  mergePolicy: "sequential_state_contract"
```

## Scope

- In scope:
  - Define event schema with `eventVersion`, `eventType`, `runId`, `phaseId`, `contractSnapshotId`, `source`, `payload`, timestamp.
  - Add append-only `events.jsonl` or SQLite-compatible adapter decision.
  - Add write helpers for key lifecycle events.
  - Add replay/read-model self-check that compares event lineage with current status/verdict.
  - Add contract change ledger event family.
- Out of scope:
  - Replacing `phase-status.yaml`.
  - Replaying all historical runs.
  - Full EventStore ORM implementation.

## Preconditions and Inputs

- Phase 01 contract snapshot ids exist.
- Phase 03/04 workset and AC verdict states are stable enough to emit events.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P05-1 | Define event schema | Add event type vocabulary and validation helper | Invalid event lacks required fields and fails test |
| P05-2 | Add writer helper | Append events atomically to selected ledger path | Concurrent-safe enough for current runner mode |
| P05-3 | Emit lifecycle events | Add events for contract created/frozen, ambiguity evaluated, workset started/completed, verification passed/failed, retry, recovery, closeout | Fixture ledger contains expected sequence |
| P05-4 | Add replay self-check | Compare latest events to current read models | Stale read model mismatch is detected |
| P05-5 | Document event/read-model boundary | Add guideline that status files are projections, not sole history | Docs audit passes |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P05-1 | A completed phase can be reconstructed from event lineage | event helper self-test | Replay reports contract, workset, verification, closeout sequence | `QA_REPORT.md` for this phase |
| SCN-P05-2 | Stale status is detected when events and read model disagree | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Stale projection fixture fails with explicit violation | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P05-1 | `.claude/scripts/lib/phase-event-ledger.mjs` or equivalent | none | event ledger unit test | `node --check .claude/scripts/lib/phase-event-ledger.mjs` | Exit 0 |
| P05-2 | test file as needed | `.claude/scripts/agent-loop-phase-state.mjs` | state/event tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |
| P05-3 | guideline file or section | `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/verify-phase-closeout.mjs` | workflow and closeout checks | `node --check .claude/scripts/workflow-enforcement.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: Event ledger becomes a second mutable truth source without reconciliation rules.
- First review checkpoint: Decide JSONL vs SQLite adapter before write helper usage spreads.
- Re-review trigger: Any event payload containing raw prompt text, secrets, or unnecessary transcript content.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/05-phase-05-event-ledger-replay-read-model-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/workflow-enforcement.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`

## Evidence to Mark Done

- Event helper test output.
- Replay mismatch fixture output.
- Documentation of event ledger vs read model boundary.

## Deliverables

- Minimal event ledger helper.
- Event vocabulary and versioning contract.
- Replay/read-model reconciliation check.

## Phase Completion Checklist

- [ ] Event schema is versioned.
- [ ] Key lifecycle events are emitted or have explicit TODO blockers.
- [ ] Read model mismatch is detectable.
- [ ] Raw prompt/secrets are not written to event payloads.

## Handoff Notes

- Phase 06 uses events to trigger semantic evaluation and consensus only when deterministic gates leave unresolved risk.
