---
title: Resumable Session Layer
description: Minimum runtime state contract for interruption-safe recovery and harness improvement signals
applies-to:
  - moonshot-phase-runner
  - moonshot-phase-executor
  - moonshot-in-session-coordinator
  - session-logger
lastReviewed: 2026-04-09
---

# Resumable Session Layer

## 1. Purpose

Use a resumable session layer when a harness run needs both of these properties:

- interruption-safe recovery without replaying the full chat
- bounded execution telemetry that can feed harness recursive improvement

This contract complements existing task docs, sprint contracts, QA reports, and handoff artifacts. It does not replace them.

## 2. Model

Freeze these identities before writing runtime state:

| Entity | Meaning | Required id |
|--------|---------|-------------|
| `task` | durable unit of work | `task_id` |
| `session` | one active conversation or runtime context | `session_id` |
| `run` | one bounded execution attempt | `run_id` |
| `event` | one append-only runtime fact | `event_id` |
| `decision` | one durable choice with rationale | `decision_id` |

Rules:

- `task_id` anchors all records for the same work unit.
- `session_id` groups runs that share the same active context.
- `run_id` must change for every retry or resumed attempt.
- `event_id` and `decision_id` must stay stable once written.

## 3. Resume Snapshot

`task_state.json` is the mutable source of truth for current resumable state.

Required fields:

| Field | Rule |
|------|------|
| `schema_version` | snapshot contract version |
| `task_id` | stable task identifier |
| `session_id` | active session identifier |
| `run_id` | active attempt identifier |
| `status` | current task state |
| `resume_from` | first artifact or checkpoint to reopen |
| `next_action` | next concrete step |
| `updated_at` | last snapshot write time |
| `storage_root` | task-local runtime root |
| `blocked_reason` | required only when blocked |
| `waiting_on` | required only when waiting for user |
| `last_event_id` | optional pointer into append-only history |
| `last_decision_id` | optional pointer into durable decision history |

Snapshot invariants:

- `resume_from`, `next_action`, and `status` are always required.
- `blocked_reason` and `waiting_on` must be `null` unless their matching state is active.
- rewrite the snapshot whenever status, active run, blocker state, or resume cursor changes.

Frozen states:

- `pending`
- `ready`
- `in_progress`
- `blocked`
- `waiting_for_user`
- `failed`
- `retrying`
- `cancelled`
- `completed`

## 4. Append-Only History

### 4.1 `session_events.jsonl`

Keep event history as append-only JSON Lines.

Required fields:

- `event_id`
- `task_id`
- `session_id`
- `run_id`
- `ts`
- `type`
- `stage`
- `actor`
- `summary`
- `payload`

Minimum event vocabulary:

- `task_started`
- `phase_changed`
- `state_changed`
- `run_interrupted`
- `run_resumed`
- `run_retried`
- `blocked`
- `artifact_created`
- `artifact_updated`
- `decision_recorded`
- `validation_passed`
- `validation_failed`
- `completed`

### 4.2 `decision_log.jsonl`

Keep only decisions that change downstream behavior, recovery, scope, or verification.

Required fields:

- `decision_id`
- `task_id`
- `session_id`
- `run_id`
- `ts`
- `category`
- `decision`
- `reason`
- `impact`
- `related_event_id`

### 4.3 `artifact_links.json`

Use a durable join map for artifacts that matter to recovery or analysis.

Each tracked artifact should record:

- `artifact_id`
- `path`
- `kind`
- `created_by_event_id`
- `latest_event_id`
- `latest_decision_id`
- `status`

Do not use loose `linked_event_type` references when a stable `event_id` is available.

## 5. Minimum Improvement Telemetry

Collect only the fields needed for harness improvement:

- `failure_type`
- `failure_stage`
- `retry_count`
- `interrupted_by`
- `resume_latency_seconds`
- `handoff_required`
- `validation_outcome`
- `verification_run_id`

Do not store full prompts, raw transcripts, or duplicated artifact contents inside runtime history.

## 6. Writer Ownership And Timing

Ownership rules:

- `task_state.json` belongs to the active run controller
- append-only logs may be written by the active run controller, verifier, or hooks
- future hooks may append events, but must not redefine snapshot semantics

Minimum write timing:

| Surface | Trigger | Required update |
|---------|---------|-----------------|
| `task_state.json` | status or run boundary changes | refresh `status`, `run_id`, `resume_from`, `next_action`, `updated_at` |
| `task_state.json` | blocker or wait changes | refresh `blocked_reason` or `waiting_on` |
| `session_events.jsonl` | run start | append `task_started` |
| `session_events.jsonl` | interruption, retry, resume | append `run_interrupted`, `run_retried`, or `run_resumed` |
| `session_events.jsonl` | artifact change | append `artifact_created` or `artifact_updated` |
| `session_events.jsonl` | verification result | append `validation_passed` or `validation_failed` |
| `decision_log.jsonl` | durable behavioral choice | append one decision entry |
| `artifact_links.json` | artifact create or update | refresh linkage ids |

## 7. Storage Policy

Use task-local mutable runtime roots for live state.

Recommended layout:

```text
<task-root>/
  runtime/
    task_state.json
    session_events.jsonl
    decision_log.jsonl
    artifact_links.json
```

Policy:

- live runtime state is mutable operational data and should be gitignored by default
- committed examples belong in durable docs or sample packages, not in live runtime paths
- if history needs correction, append a correction event instead of rewriting prior event lines

## 8. Recovery Read Path

A new worker should recover in this order:

1. open `task_state.json`
2. inspect `resume_from`, `next_action`, and `status`
3. use `last_event_id` and `last_decision_id` to jump into durable history only when needed
4. open `artifact_links.json` only when cross-referencing a generated artifact

## 9. Adoption Rule

Adopt this layer when any of the following is true:

- work is expected to continue across multiple sessions
- a phase runner may stop and resume later
- retries and interruptions need to become harness improvement input
- the handoff cost is high enough that a mutable snapshot is cheaper than replaying context

For simple, single-session work, `SPRINT_CONTRACT.md`, `QA_REPORT.md`, and `HANDOFF.md` remain sufficient without extra runtime state.
