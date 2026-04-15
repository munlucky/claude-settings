# Phase 02: Event Telemetry And Artifact Linkage (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-SL-2 | work-plan Core Requirements | append-only events with stable ids | define `session_events.jsonl` |
| REQ-SL-5 | work-plan Core Requirements | decisions preserve reason and impact | define `decision_log.jsonl` |
| REQ-SL-6 | work-plan Core Requirements | artifacts link back to events | define `artifact_links.json` |
| REQ-SL-7 | work-plan Core Requirements | telemetry supports harness improvement | define bounded telemetry fields |
| SCN-SL-2 | work-plan Critical Scenarios | repeated failure becomes improvement input | include retry and failure telemetry |

## Goal

- define the append-only telemetry and linkage structures needed for interruption reconstruction and harness analysis

## Expected Outcome

- event, decision, and artifact schemas are aligned
- linkage uses stable ids rather than loose type-only references
- telemetry fields are small, explicit, and implementation-ready

## Frozen Contracts

### `session_events.jsonl`

The event log is append-only JSON Lines. Each line is one immutable event.

Required fields:

| Field | Type | Rule |
|------|------|------|
| `event_id` | string | stable unique id for the event |
| `task_id` | string | must match the active task package |
| `session_id` | string | active session identifier from phase 1 |
| `run_id` | string | active execution attempt identifier from phase 1 |
| `ts` | string | ISO-8601 timestamp for append time |
| `type` | enum | one of the frozen event types below |
| `stage` | string | `ready/isolate`, `execute`, `review`, `verify`, or `finish/handoff` |
| `actor` | string | `agent`, `human`, `system`, `hook`, or `verifier` |
| `summary` | string | one-line fact for quick human scanning |
| `payload` | object | type-specific structured details |

Frozen event types for phase 2:

| Type | Meaning | Required payload fields |
|------|---------|-------------------------|
| `task_started` | the task package entered an active run | `source`, `phase_number` |
| `phase_changed` | active phase or state cursor changed | `from_phase`, `to_phase`, `reason` |
| `state_changed` | snapshot state changed | `from_status`, `to_status`, `resume_from`, `next_action` |
| `run_interrupted` | the current run stopped unexpectedly or intentionally | `interrupted_by`, `reason`, `handoff_required` |
| `run_resumed` | a new run resumes prior work | `from_run_id`, `resume_from`, `prior_event_id` |
| `run_retried` | a failed or interrupted run is replaced with a fresh attempt | `from_run_id`, `to_run_id`, `retry_count`, `reason` |
| `blocked` | work is blocked by dependency or environment | `blocked_reason`, `blocking_dependency` |
| `artifact_created` | a new artifact path was created | `artifact_id`, `path`, `kind` |
| `artifact_updated` | an existing artifact changed | `artifact_id`, `path`, `kind` |
| `decision_recorded` | a durable decision entry was written | `decision_id`, `category` |
| `validation_passed` | a verification command or review gate passed | `verification_run_id`, `command_name`, `outcome` |
| `validation_failed` | a verification command or review gate failed | `verification_run_id`, `command_name`, `outcome`, `failure_type` |
| `completed` | the in-scope phase or task closed cleanly | `scope`, `verification_run_id`, `score_verdict` |

Event rules:

- append only; never mutate or delete prior lines
- corrections are written as new events rather than editing prior events
- `event_id` ordering may be lexical or timestamp-derived, but the file append order is the authoritative chronology
- every `artifact_created`, `artifact_updated`, and `decision_recorded` event must be linkable through a stable id

Example lines:

```json
{"event_id":"EVT-0001","task_id":"resumable-session-layer","session_id":"session-20260409-1440","run_id":"phase02-attempt-01","ts":"2026-04-09T15:10:00+09:00","type":"task_started","stage":"ready/isolate","actor":"agent","summary":"phase 2 attempt started","payload":{"source":"phase-runner","phase_number":2}}
{"event_id":"EVT-0002","task_id":"resumable-session-layer","session_id":"session-20260409-1440","run_id":"phase02-attempt-01","ts":"2026-04-09T15:13:00+09:00","type":"artifact_updated","stage":"execute","actor":"agent","summary":"phase 2 contract updated","payload":{"artifact_id":"ART-telemetry-phase-doc","path":".claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md","kind":"phase-doc"}}
{"event_id":"EVT-0003","task_id":"resumable-session-layer","session_id":"session-20260409-1440","run_id":"phase02-attempt-01","ts":"2026-04-09T15:18:00+09:00","type":"validation_passed","stage":"verify","actor":"verifier","summary":"knowledge audit passed","payload":{"verification_run_id":"verify-phase02","command_name":"knowledgeAudit","outcome":"passed"}}
```

### `decision_log.jsonl`

The decision log keeps only durable choices that affect resumption or downstream implementation.

Required fields:

| Field | Type | Rule |
|------|------|------|
| `decision_id` | string | stable unique id |
| `task_id` | string | required |
| `session_id` | string | required |
| `run_id` | string | required |
| `ts` | string | ISO-8601 timestamp |
| `category` | enum | `scope`, `schema`, `policy`, `recovery`, `verification` |
| `decision` | string | one-line choice statement |
| `reason` | string | why the choice was made |
| `impact` | array[string] | concrete downstream effects |
| `related_event_id` | string or null | pointer to the event that triggered or recorded the choice |

Decision capture rules:

- record only choices that alter the next run, recovery behavior, or downstream implementation boundaries
- do not record every observation as a decision
- if a later run reverses a prior decision, create a new decision entry that cites the earlier `decision_id`

Example line:

```json
{"decision_id":"DEC-0004","task_id":"resumable-session-layer","session_id":"session-20260409-1440","run_id":"phase02-attempt-01","ts":"2026-04-09T15:15:00+09:00","category":"policy","decision":"Artifact linkage must use event ids instead of event types","reason":"type-only linkage cannot reconstruct which exact update produced an artifact","impact":["artifact_links.json requires created_by_event_id","phase 3 writer logic must emit stable ids"],"related_event_id":"EVT-0002"}
```

### `artifact_links.json`

The artifact map is the durable join table between task artifacts and execution history.

Required fields:

| Field | Type | Rule |
|------|------|------|
| `task_id` | string | required |
| `updated_at` | string | last map refresh timestamp |
| `artifacts` | array | each artifact entry follows the contract below |

Artifact entry contract:

| Field | Type | Rule |
|------|------|------|
| `artifact_id` | string | stable id referenced by events |
| `path` | string | repository-relative path |
| `kind` | string | `task-doc`, `phase-doc`, `qa-report`, `handoff`, `scorecard`, `verdict`, `sample-runtime-file`, etc. |
| `created_by_event_id` | string | required stable pointer to the creation event |
| `latest_event_id` | string | required stable pointer to the most recent update event |
| `latest_decision_id` | string or null | optional pointer to the last decision that materially changed the artifact |
| `phase_number` | integer | phase ownership |
| `status` | enum | `active`, `archived`, `sample`, `superseded` |

Linkage rules:

- no artifact may rely only on `linked_event_type`
- `created_by_event_id` never changes after creation
- `latest_event_id` changes on every material update
- sample package artifacts are tracked with `status=sample`, not mixed with live runtime state

### Minimum Telemetry

Phase 2 freezes only the telemetry fields needed for harness recursive improvement:

| Field | Type | Why it exists | Allowed collection point |
|------|------|---------------|--------------------------|
| `failure_type` | string | cluster repeated failure patterns | `validation_failed`, `run_interrupted` |
| `failure_stage` | string | locate the failing stage in the workflow | `validation_failed`, `blocked` |
| `retry_count` | integer | measure remediation churn | `run_retried` |
| `interrupted_by` | string | distinguish user pause from environment stop | `run_interrupted` |
| `resume_latency_seconds` | integer | estimate recovery cost | computed or recorded on `run_resumed` |
| `handoff_required` | boolean | detect where autonomous execution needs human or new-agent intervention | `run_interrupted`, `run_retried` |
| `validation_outcome` | string | summarize gate results for improvement analysis | `validation_passed`, `validation_failed` |
| `verification_run_id` | string | join QA evidence to event history | validation events and `completed` |

Telemetry boundaries:

- no token counts, full prompts, or conversation transcripts
- no duplicate copies of artifact contents inside the event log
- no attempt to store every shell command outside the verification verdict artifacts

### Phase 2 Completion Note

- Phase 2 freezes append-only schemas, linkage keys, and telemetry vocabulary.
- Phase 3 must consume these names as-is when defining writer timing and sample recovery flows.

## Scope

- in scope:
  - event schema
  - decision schema
  - artifact linkage schema
  - telemetry field definitions
- out of scope:
  - runtime hook implementation
  - archive automation
  - aggregate analytics UI

## Preconditions and Inputs

- required docs:
  - `.claude/docs/tasks/resumable-session-layer/work-plan.md`
  - `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md`
- required references:
  - `.claude/verification.contract.yaml`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Define event schema | 1) define required fields 2) define stable ids 3) define initial event types | interruption and retry flows can be reconstructed |
| P02-2 | Define decision schema | 1) define decision fields 2) define reason/impact expectations 3) define when to record | resume-time interpretation is practical |
| P02-3 | Define artifact linkage | 1) define artifact structure 2) require event-id linkage 3) define latest-update semantics | created and updated artifacts can be traced |
| P02-4 | Define telemetry | 1) list minimum telemetry 2) define allowed collection points 3) avoid over-collection | the harness gets useful signals without instrumentation sprawl |

## Validation Plan

- [x] event ids, decision ids, and artifact references are consistent
- [x] retry and interruption fields support recursive improvement analysis
- [x] linkage avoids ambiguous `linked_event_type`-only references

## Evidence to Mark Done

- schema definitions
- event type catalog
- telemetry field matrix

## Deliverables

- `session_events.jsonl` contract
- `decision_log.jsonl` contract
- `artifact_links.json` contract
- minimum telemetry field list

## Phase Completion Checklist

- [x] all detailed tasks meet done criteria
- [x] validation checks pass
- [x] deliverables are present and reviewed

## Handoff Notes

- phase 03 should consume these schemas when defining writer timing and sample recovery flows
