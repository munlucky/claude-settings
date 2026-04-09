# Phase 03: Harness Integration And Recovery Proof (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-SL-8 | work-plan Core Requirements | session layer complements existing docs and skills | define harness integration boundaries |
| SCN-SL-1 | work-plan Critical Scenarios | interruption and resume without full chat replay | define and prove sample recovery flow |
| SCN-SL-3 | work-plan Critical Scenarios | human understands why work stopped and what to do next | define sample package and operational reading path |

## Goal

- connect the state and telemetry model back to the harness so the session layer can be adopted without replacing the existing workflow system

## Expected Outcome

- writer/update rules are explicit
- integration points with harness-owned surfaces are bounded
- a sample package proves interruption, retry, and resume reconstruction

## Frozen Integration Rules

### Writer Timing Matrix

| Surface | Write Trigger | Required Update |
|---------|---------------|-----------------|
| `task_state.json` | status change | rewrite snapshot with new `status`, `resume_from`, `next_action`, and `updated_at` |
| `task_state.json` | run boundary change | rewrite `run_id`, `session_id` if needed, and active artifact paths |
| `task_state.json` | blocker or wait condition changes | rewrite `blocked_reason` or `waiting_on` |
| `session_events.jsonl` | start of every run | append `task_started` |
| `session_events.jsonl` | phase/stage transition | append `phase_changed` or `state_changed` |
| `session_events.jsonl` | artifact create/update | append `artifact_created` or `artifact_updated` |
| `session_events.jsonl` | interruption, retry, or resume | append `run_interrupted`, `run_retried`, or `run_resumed` |
| `session_events.jsonl` | verification result | append `validation_passed` or `validation_failed` |
| `decision_log.jsonl` | durable choice that changes downstream behavior | append decision entry with `related_event_id` |
| `artifact_links.json` | artifact create/update | update `latest_event_id` and `latest_decision_id` if applicable |

Correction strategy:

- snapshot fixes are direct rewrites because `task_state.json` is mutable
- history fixes are correction events appended to `session_events.jsonl`
- artifact map fixes must preserve prior `created_by_event_id`

### Harness Touchpoints

The session layer integrates only with harness-owned surfaces already present in this repository.

| Surface | Integration Role | Session-layer responsibility |
|---------|------------------|------------------------------|
| `.claude/scripts/moonshot-phase-dispatch.mjs` | dispatch start and execution-mode resolution | emit `task_started`, initialize task-local runtime root, and record dispatch metadata |
| `.claude/scripts/agent-loop.mjs` | phase loop and retry advancement | update snapshot on phase transitions and append `run_retried` / `completed` events |
| `.claude/scripts/agent-loop-phase-runner.mjs` | single phase attempt orchestration | assign fresh `run_id`, write attempt-start snapshot, and keep artifact paths current |
| `.claude/scripts/agent-loop-phase-runtime.mjs` | worker prompt execution and completion gate | capture interruption, verification outcome, and handoff-required signals |
| `.claude/scripts/write-verification-verdict.py` | structured verifier output | provide `verification_run_id` and verdict paths that are referenced from events and QA artifacts |
| future hooks | optional automation points | append events only; do not redefine snapshot or schema semantics |

Boundaries:

- no changes to MCP protocol shape are required
- no global subagent taxonomy changes are required
- any future hook may append events, but snapshot ownership stays with the active run controller

### Operational Policy

Live runtime data and committed examples are separated deliberately.

Committed examples:

- `.claude/docs/tasks/resumable-session-layer/samples/**`

Mutable runtime state:

- `.claude/docs/tasks/resumable-session-layer/runtime/**`

Policy decisions:

- live runtime files are mutable operational state and should be gitignored by default once implementation begins
- committed sample files are documentation artifacts and stay under `samples/`
- archive a finished runtime session under `runtime/archive/<task-id>/` when the task closes or is superseded
- manual edits to live history require a new correction event; manual edits to sample files are normal documentation updates

### Recovery Proof

The sample package in `.claude/docs/tasks/resumable-session-layer/samples/phase03-recovery/` demonstrates:

1. an interrupted run with a concrete stop reason
2. a retry with a new `run_id`
3. a resumed run that points directly to the next artifact and next action

Reading order for a new worker:

1. open `task_state.json`
2. inspect `resume_from` and `next_action`
3. use `last_event_id` and `last_decision_id` to locate the most recent durable history
4. inspect `artifact_links.json` only if the artifact path needs cross-referencing

### Phase 3 Completion Note

- Phase 3 does not implement runtime writers; it freezes where and when they will write.
- The committed sample package is the proof artifact for interruption-safe recovery.

## Scope

- in scope:
  - writer/update timing rules
  - harness integration points
  - git and ignore policy definition
  - sample recovery package
- out of scope:
  - analytics dashboard
  - non-harness product features
  - broad subagent taxonomy redesign

## Preconditions and Inputs

- required docs:
  - `.claude/docs/tasks/resumable-session-layer/work-plan.md`
  - `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md`
- required references:
  - `.claude/skills/moonshot-phase-runner/SKILL.md`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/agent-loop.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Define writer timing | 1) define snapshot update moments 2) define append moments 3) define correction strategy | update rules are explicit and bounded |
| P03-2 | Define harness touchpoints | 1) map hooks and loop surfaces 2) define minimal integration points 3) keep boundaries narrow | future implementation has clear insertion points |
| P03-3 | Define operational policy | 1) decide git/ignore handling 2) define archive timing 3) define manual edit rules | mutable runtime data has a clear operating policy |
| P03-4 | Build recovery proof | 1) create sample state and logs 2) document interruption/retry flow 3) validate resume readability | a new worker can reconstruct the sample flow quickly |

## Validation Plan

- [x] sample package proves interruption, retry, and resume reconstruction
- [x] integration boundaries stay within harness-owned files and docs
- [x] operational policy does not conflict with existing task and verification contracts

## Evidence to Mark Done

- integration mapping
- sample recovery package
- policy decisions for storage and archival behavior

## Deliverables

- harness integration rules
- update timing rules
- storage and git policy decisions
- sample interruption/resume package

## Phase Completion Checklist

- [x] all detailed tasks meet done criteria
- [x] validation checks pass
- [x] deliverables are present and reviewed

## Handoff Notes

- close the initiative only after sample recovery evidence and finish artifacts are complete
