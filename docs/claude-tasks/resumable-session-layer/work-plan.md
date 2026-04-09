# Resumable Session Layer Work Plan

Last-Reviewed: 2026-04-09

## Execution Strategy

Introduce the resumable session layer in three bounded phases. Phase 1 freezes the resume contract and state model. Phase 2 standardizes append-only telemetry and artifact linkage. Phase 3 connects the model back to the harness so the logs become usable for recovery and recursive improvement.

This initiative is documentation-first at the start. A separate `SPEC.md` is intentionally deferred until there are multiple code consumers for the same contract.

## Why This Exists

The session layer exists for two concrete reasons:

- interrupted work must be resumable with low handoff cost
- harness recursion and improvement work must have structured execution data

The immediate problem is not missing guidance documents. The problem is that execution state, interruption points, and retry history are not captured in a durable, machine-readable form.

## Core Requirements

- `REQ-SL-1`: a future worker can understand the current task state and next action from a single snapshot file
- `REQ-SL-2`: execution events are recorded in append-only order with stable identifiers
- `REQ-SL-3`: the model distinguishes `task`, `session`, `run`, `event`, and `decision`
- `REQ-SL-4`: failure, interruption, retry, and waiting states are first-class, not edge cases
- `REQ-SL-5`: important decisions retain enough reason and impact detail for resume-time reconstruction
- `REQ-SL-6`: artifacts can be linked back to the event that created or last updated them
- `REQ-SL-7`: the logs expose the minimum telemetry needed for harness recursive improvement
- `REQ-SL-8`: the new layer complements existing `AGENTS.md`, rules, skills, and task docs without replacing them

## Critical Scenarios

- `SCN-SL-1`: an agent stops mid-task and a new agent resumes without re-reading the full conversation
- `SCN-SL-2`: a repeated failure pattern can be traced across retries and mapped to a harness improvement candidate
- `SCN-SL-3`: a human opens the repo and understands why the task stopped and what to do next

## Progress Snapshot

- phase package prepared
- phase 01 resume contract frozen in task docs
- phase 02 telemetry contracts frozen in task docs
- phase 03 integration rules and recovery proof added
- closeout is pending only on repository-level parity warning review

## Phase 1: Resume Contract And State Model

### Objectives

- define the minimum resumable state contract
- freeze the identity model for `task`, `session`, `run`, `event`, and `decision`
- define which file is the snapshot and which file is the durable history

### Tasks

- define `task_state.json` semantics and required fields
- define state transition rules including `blocked`, `waiting_for_user`, `failed`, `retrying`, and `cancelled`
- define source-of-truth rules between snapshot and append-only logs
- decide the default task-local storage root and explicit status-file routing

### Exit Criteria

- the resume contract is documented without unresolved terminology conflicts
- a future worker can identify `resume_from`, `blocked_reason`, and `next_action` from the model
- task-local phase packaging and status-file routing are explicit

### Status

- complete

## Phase 2: Event Telemetry And Artifact Linkage

### Objectives

- define append-only event and decision schemas
- standardize the telemetry needed for recursive harness improvement
- define how artifacts link back to execution history

### Tasks

- define `session_events.jsonl`
- define `decision_log.jsonl`
- define `artifact_links.json`
- define stable ids and linkage keys
- define telemetry fields such as failure type, retry count, interruption cause, and validation outcome

### Exit Criteria

- event and decision schemas can reconstruct interruption and retry history
- artifact linkage references stable event ids rather than loose event types
- telemetry fields are narrow enough to implement without instrumentation sprawl

### Status

- complete

## Phase 3: Harness Integration And Recovery Proof

### Objectives

- connect the session layer to real harness touchpoints
- define when the snapshot is updated and when events append
- prove the model with a sample task and interruption/resume walkthrough

### Tasks

- define writer/update rules for phase transitions, validation, and blocking
- define integration points for hooks, `moonshot-phase-dispatch`, `agent-loop`, and future subagent rounds
- define git/ignore/archive policy for mutable runtime data
- create a sample package showing interruption, retry, and resume reconstruction

### Exit Criteria

- the harness integration points are explicit enough to implement
- a sample log set demonstrates interruption and recovery
- follow-on implementation can start without needing a separate product-level spec

### Status

- complete

## Deliverables Checklist

- `ASSUMPTIONS.md`
- `work-plan.md`
- `implementation/00-master-plan-v1.md`
- phase implementation docs
- execution bridge artifacts per phase
- task-local `phase-status.yaml`
- task-local `phase-runner-result.yaml`

## Deferred Until Later

- standalone `SPEC.md`
- full writer/reader implementation
- automatic hook emission
- archive automation
- dashboarding or aggregate analytics
