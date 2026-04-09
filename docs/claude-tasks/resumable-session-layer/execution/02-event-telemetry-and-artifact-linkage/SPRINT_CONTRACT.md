# SPRINT CONTRACT

## Slice
- Name: Event Telemetry And Artifact Linkage
- Owner: Codex
- Source task: `.claude/docs/tasks/resumable-session-layer/work-plan.md`
- Phase document: `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md`

## Round Goal
- Define the append-only schemas and minimal telemetry that make retries, interruptions, and artifacts analyzable by the harness.

## In-Scope Traceability
- Requirement IDs (`REQ-*`): REQ-SL-2, REQ-SL-5, REQ-SL-6, REQ-SL-7
- Critical scenarios (`SCN-*`): SCN-SL-2
- UAT-critical checks covered this round: interruption and retry telemetry is reconstructible from the schema contract

## Non-Goals
- Do not implement runtime hooks yet.
- Do not design dashboard or aggregation surfaces.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Define `session_events.jsonl`, `decision_log.jsonl`, and `artifact_links.json`
- Define stable linkage ids
- Define bounded telemetry fields for recursive harness improvement

## Policy Anchors
- Always-loaded rules: `.claude/rules/basic-principles.md`, `.claude/rules/workflow.md`, `.claude/rules/context-management.md`, `.claude/rules/communication.md`, `.claude/rules/output-format.md`, `.claude/rules/agents/agent-definition.md`, `.claude/rules/agents/agent-delegation.md`
- Active workspace contract: `.claude/CLAUDE.md`
- Verification contract: `.claude/verification.contract.yaml`
- Phase-specific guides: `.claude/docs/tasks/resumable-session-layer/work-plan.md`, `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md`
- Round policy summary: schema and telemetry design only; no instrumentation implementation

## Review Cadence
- First review checkpoint: after event, decision, and artifact contracts are aligned
- Re-review trigger: if a linkage field or telemetry field changes
- Review owners: `codex-review-code`

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Event schema defined | contract | append-only event fields and initial type catalog are documented |
| Decision schema defined | contract | decision fields cover reason and impact |
| Artifact linkage defined | contract | artifacts link via stable event ids |
| Telemetry bounded | policy | improvement fields are useful without over-collection |

## Traceability Exit Criteria
| ID | Type | Verification Path | Evidence Required |
|----|------|-------------------|-------------------|
| REQ-SL-2 | REQ | doc review | stable event ids and event fields |
| REQ-SL-5 | REQ | doc review | decision schema includes reason and impact |
| REQ-SL-6 | REQ | doc review | artifact linkage uses event ids |
| REQ-SL-7 | REQ | doc review | telemetry field matrix exists |

## Evaluator Focus
- ambiguous or duplicative identifiers
- telemetry fields with unclear collection timing
- artifact linkage that relies on event type only

## Evidence
- Required commands: `git diff --stat`
- Runtime flow: none in prepare-only state
- Screenshots/logs: none
- Requirements traceability update: master plan mapping
- Scenario matrix update: not required in this round
- UAT checklist state: not required in this round

## Finish Rule
- Clean finish requires: schemas and telemetry rules are internally consistent and reviewed
- Continue-now rule: if linkage or telemetry semantics remain ambiguous, keep working
- Resume-later handoff trigger: the phase remains prepared but unexecuted
- Retry-loop trigger: field drift across the three schema documents
- Target completion score: 100

## Risks
- telemetry scope may become too broad and expensive to implement
- schema drift may make the improvement signals hard to trust
