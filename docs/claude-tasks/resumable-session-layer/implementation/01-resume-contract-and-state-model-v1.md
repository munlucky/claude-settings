# Phase 01: Resume Contract And State Model (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-SL-1 | work-plan Core Requirements | snapshot file exposes resumable current state | define `task_state.json` required fields and semantics |
| REQ-SL-3 | work-plan Core Requirements | identity model is explicit | define ids and their relationships |
| REQ-SL-4 | work-plan Core Requirements | failure and retry states are first-class | define state model and transition rules |

## Goal

- freeze the minimum state contract required for interruption-safe resume and future instrumentation

## Expected Outcome

- the task model distinguishes `task`, `session`, `run`, `event`, and `decision`
- `task_state.json` is defined as the resume snapshot
- state transitions and exceptional states are explicit

## Frozen Contract

### Identity Model

| Entity | Purpose | Cardinality | Required Id | Uniqueness Expectation |
|--------|---------|-------------|-------------|------------------------|
| `task` | durable unit of work scoped to one task package | one task owns many sessions and runs | `task_id` | stable inside the task package; never reused for a different task |
| `session` | one human or agent session that can span multiple runs | one session owns many runs | `session_id` | unique per resumed conversation or runtime session |
| `run` | one bounded execution attempt inside a session | one run belongs to exactly one task and one session | `run_id` | unique per attempt; never reused after failure or interruption |
| `event` | append-only record of a runtime fact | one run owns many events | `event_id` | unique inside the task history and ordered by append position |
| `decision` | durable record of a choice with rationale | one run owns many decisions; may reference an event | `decision_id` | unique inside the task history and stable when cited later |

### Identity Relationship Rules

- `task_id` is the root identifier for the package and anchors every other record.
- `session_id` groups consecutive runs that share the same active conversation or runtime context.
- `run_id` changes for every retry, interruption recovery, or new bounded attempt, even when `session_id` stays the same.
- `event_id` and `decision_id` are reserved in phase 1 so phase 2 can define append-only payloads without renaming the model.
- Snapshot fields may reference `event_id` and `decision_id`, but phase 1 does not define their payload schemas.

### Resume Snapshot Contract

`task_state.json` is the only required mutable snapshot for resume. A future worker must be able to recover the current state and next action from this file alone.

Required fields:

| Field | Type | Rule |
|------|------|------|
| `schema_version` | string | snapshot contract version; phase 1 freezes `1.0` |
| `task_id` | string | stable task identifier |
| `session_id` | string | active session identifier |
| `run_id` | string | active execution attempt identifier |
| `phase_number` | integer | current phase number |
| `phase_title` | string | current phase title for human-readable recovery |
| `status` | enum | one of the frozen task states in this phase |
| `resume_from` | string | precise resume cursor: file path, artifact, or stage checkpoint to reopen first |
| `next_action` | string | next concrete action to take without re-reading the full chat |
| `updated_at` | string | ISO-8601 timestamp for the last snapshot write |
| `storage_root` | string | task-local mutable runtime root for future session-layer files |
| `phase_status_path` | string | explicit task-local path to `phase-status.yaml` |
| `active_phase_doc_path` | string | explicit task-local path to the current phase doc |
| `active_sprint_contract_path` | string | explicit task-local path to the sprint contract |
| `blocked_reason` | string or null | mandatory when `status=blocked`; otherwise `null` |
| `waiting_on` | string or null | mandatory when `status=waiting_for_user`; otherwise `null` |
| `last_event_id` | string or null | optional pointer to the latest append-only event once phase 2 exists |
| `last_decision_id` | string or null | optional pointer to the latest durable decision once phase 2 exists |

Resume-critical invariants:

- `resume_from`, `next_action`, and `status` must always be present.
- `blocked_reason` must be present and non-null only when the snapshot is blocked.
- `waiting_on` must be present and non-null only when the snapshot is waiting for external input.
- `run_id` must change before entering `retrying` or a new `in_progress` attempt after failure/interruption.
- The snapshot must be rewritten whenever status changes, ownership of the active run changes, or the resume cursor changes.

Recommended minimal shape:

```json
{
  "schema_version": "1.0",
  "task_id": "resumable-session-layer",
  "session_id": "session-20260409-1440",
  "run_id": "phase01-attempt-01",
  "phase_number": 1,
  "phase_title": "Resume Contract And State Model",
  "status": "in_progress",
  "resume_from": ".claude/docs/tasks/resumable-session-layer/execution/01-phase-01-resume-contract-and-state-model-v1/QA_REPORT.md",
  "next_action": "Run the phase-1 verification commands and record the verdict file.",
  "updated_at": "2026-04-09T14:40:59+09:00",
  "storage_root": ".claude/docs/tasks/resumable-session-layer/runtime",
  "phase_status_path": ".claude/docs/tasks/resumable-session-layer/phase-status.yaml",
  "active_phase_doc_path": ".claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md",
  "active_sprint_contract_path": ".claude/docs/tasks/resumable-session-layer/execution/01-phase-01-resume-contract-and-state-model-v1/SPRINT_CONTRACT.md",
  "blocked_reason": null,
  "waiting_on": null,
  "last_event_id": null,
  "last_decision_id": null
}
```

### State Model

Frozen states for phase 1:

| State | Meaning | Allowed Next States |
|-------|---------|---------------------|
| `pending` | phase package exists but active work has not started | `ready`, `cancelled` |
| `ready` | scope, contract, and routing are known and the run can start | `in_progress`, `cancelled` |
| `in_progress` | active work is executing | `blocked`, `waiting_for_user`, `failed`, `retrying`, `completed`, `cancelled` |
| `blocked` | progress cannot continue until a dependency or environment issue clears | `retrying`, `cancelled` |
| `waiting_for_user` | progress is paused on explicit human input | `retrying`, `cancelled` |
| `failed` | the current run ended unsuccessfully and needs remediation or a new attempt | `retrying`, `cancelled` |
| `retrying` | a new run is being prepared after interruption or failure | `in_progress`, `blocked`, `waiting_for_user`, `failed`, `cancelled` |
| `cancelled` | work stopped intentionally and will not continue automatically | terminal |
| `completed` | in-scope phase work, review, and verification are all done | terminal |

State rules:

- `completed` is valid only after review evidence and verification evidence exist.
- `retrying` is not a synonym for `in_progress`; it is the handoff state between failed or interrupted runs and the next active attempt.
- `blocked` and `waiting_for_user` are first-class states and must not be encoded as free-text notes on `in_progress`.
- `failed` records an unsuccessful run outcome even when another retry may follow immediately.
- `cancelled` is terminal for the current task unless a human explicitly reopens the work with a new run.

### Source Of Truth Rules

- `task_state.json` is the source of truth for the current resumable state.
- Future append-only logs are the source of truth for chronology and historical reconstruction.
- When append-only logs exist, the snapshot may summarize the latest state but must not invent ids, states, or transitions that are absent from durable history.
- If snapshot and history disagree, repair the snapshot from durable history before resuming execution.

### Storage Routing

- Task-local package root: `.claude/docs/tasks/resumable-session-layer/`
- Recommended mutable runtime root: `.claude/docs/tasks/resumable-session-layer/runtime`
- Explicit status file path: `.claude/docs/tasks/resumable-session-layer/phase-status.yaml`
- Explicit phase runner result path: `.claude/docs/tasks/resumable-session-layer/phase-runner-result.yaml`
- Phase execution must target the task-local package paths directly and must not rely on global default status-file discovery.

### Phase 1 Completion Note

- Phase 1 freezes names, states, and snapshot semantics only.
- Phase 2 must reuse these ids and states without renaming them.
- Phase 3 may wire runtime writers to these contracts but must not redefine the model.

## Scope

- in scope:
  - identity model
  - snapshot semantics
  - state transitions
  - task-local storage root recommendation
- out of scope:
  - append-only event payload definitions
  - instrumentation hooks
  - implementation of runtime writers

## Preconditions and Inputs

- required docs:
  - `.claude/docs/tasks/resumable-session-layer/work-plan.md`
  - `.claude/docs/tasks/resumable-session-layer/implementation/00-master-plan-v1.md`
- required references:
  - `.claude/skills/moonshot-phase-runner/SKILL.md`
  - `.claude/verification.contract.yaml`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Define identity model | 1) define each id 2) document relationships 3) define uniqueness expectations | the model has no ambiguous term overlap |
| P01-2 | Define snapshot contract | 1) define required fields 2) define resume-critical fields 3) define update moments | a future worker can resume from the snapshot alone |
| P01-3 | Define state transitions | 1) define normal path 2) define exceptional states 3) define source-of-truth rule | state changes and exception handling are explicit |
| P01-4 | Define storage routing | 1) select task-local root 2) define explicit status-file path usage | phase execution can target the task-local package without relying on global status defaults |

## Validation Plan

- [x] state names are consistent across work-plan and phase docs
- [x] snapshot fields cover `resume_from`, `blocked_reason`, and `next_action`
- [x] state model distinguishes mutable snapshot from append-only history

## Evidence to Mark Done

- updated phase documentation
- frozen resume contract definitions
- explicit task-local path policy

## Deliverables

- state model section in the task docs
- task-local routing rule for `phase-status.yaml`
- acceptance-ready definition of `task_state.json`

## Phase Completion Checklist

- [x] all detailed tasks meet done criteria
- [x] validation checks pass
- [x] deliverables are present and reviewed

## Handoff Notes

- phase 02 must reuse the ids and state names defined here without renaming them
