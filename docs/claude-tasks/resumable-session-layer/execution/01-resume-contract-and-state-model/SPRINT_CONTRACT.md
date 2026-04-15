# SPRINT CONTRACT

## Slice
- Name: Resume Contract And State Model
- Owner: Codex
- Source task: `.claude/docs/tasks/resumable-session-layer/work-plan.md`
- Phase document: `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md`

## Round Goal
- Freeze the minimum identity and state model that allows interruption-safe resume without depending on full conversation replay.

## In-Scope Traceability
- Requirement IDs (`REQ-*`): REQ-SL-1, REQ-SL-3, REQ-SL-4
- Critical scenarios (`SCN-*`): SCN-SL-1, SCN-SL-3
- UAT-critical checks covered this round: resume snapshot readability and unambiguous state naming

## Non-Goals
- Do not define append-only event payloads in detail.
- Do not add runtime writer code yet.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Define the identity model for `task`, `session`, `run`, `event`, and `decision`
- Define `task_state.json` semantics and state transitions
- Document task-local status-file routing

## Policy Anchors
- Always-loaded rules: `.claude/rules/basic-principles.md`, `.claude/rules/workflow.md`, `.claude/rules/context-management.md`, `.claude/rules/communication.md`, `.claude/rules/output-format.md`, `.claude/rules/agents/agent-definition.md`, `.claude/rules/agents/agent-delegation.md`
- Active workspace contract: `.claude/CLAUDE.md`
- Verification contract: `.claude/verification.contract.yaml`
- Phase-specific guides: `.claude/docs/tasks/resumable-session-layer/work-plan.md`, `.claude/docs/tasks/resumable-session-layer/ASSUMPTIONS.md`
- Round policy summary: contract freeze only; no runtime writer implementation in this round

## Review Cadence
- First review checkpoint: after state names, ids, and snapshot semantics are drafted
- Re-review trigger: if source-of-truth rules between snapshot and events change
- Review owners: `codex-review-code`

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Identity model frozen | contract | task/session/run/event/decision terms are explicit and non-overlapping |
| Snapshot contract defined | docs | `task_state.json` fields and semantics are documented |
| Exceptional states covered | docs | `blocked`, `waiting_for_user`, `failed`, `retrying`, and `cancelled` are defined |

## Traceability Exit Criteria
| ID | Type | Verification Path | Evidence Required |
|----|------|-------------------|-------------------|
| REQ-SL-1 | REQ | doc review | snapshot field list covers resume-critical data |
| REQ-SL-3 | REQ | doc review | identity model is explicit |
| REQ-SL-4 | REQ | doc review | state model includes failure and retry paths |

## Evaluator Focus
- ambiguous naming between task, session, and run
- missing resume-critical fields
- state definitions that only cover the happy path

## Evidence
- Required commands: `git diff --stat`
- Runtime flow: none in prepare-only state
- Screenshots/logs: none
- Requirements traceability update: phase doc + master plan mapping
- Scenario matrix update: not required in this round
- UAT checklist state: not required in this round

## Finish Rule
- Clean finish requires: contract definitions are drafted, reviewed, and aligned with the work plan
- Continue-now rule: if state semantics are still ambiguous, keep working
- Resume-later handoff trigger: scope stays prepared-only without execution
- Retry-loop trigger: conflicting naming or missing exceptional-state handling
- Target completion score: 100

## Risks
- the snapshot may grow into an overloaded source-of-truth document
- terminology drift can make later telemetry work inconsistent
