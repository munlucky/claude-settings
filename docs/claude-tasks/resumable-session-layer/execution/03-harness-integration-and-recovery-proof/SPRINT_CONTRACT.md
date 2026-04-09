# SPRINT CONTRACT

## Slice
- Name: Harness Integration And Recovery Proof
- Owner: Codex
- Source task: `.claude/docs/tasks/resumable-session-layer/work-plan.md`
- Phase document: `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md`

## Round Goal
- Define how the session layer integrates with harness-owned surfaces and prove the model with an interruption/retry/resume sample package.

## In-Scope Traceability
- Requirement IDs (`REQ-*`): REQ-SL-8
- Critical scenarios (`SCN-*`): SCN-SL-1, SCN-SL-3
- UAT-critical checks covered this round: sample package makes stop reason and next action obvious to a new worker

## Non-Goals
- Do not redesign the entire subagent or hook taxonomy.
- Do not add dashboard or reporting UI.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Define snapshot update and event append timing
- Map integration points for hooks, `moonshot-phase-dispatch`, and `agent-loop`
- Define git/ignore/archive policy
- Create sample interruption, retry, and resume artifacts

## Policy Anchors
- Always-loaded rules: `.claude/rules/basic-principles.md`, `.claude/rules/workflow.md`, `.claude/rules/context-management.md`, `.claude/rules/communication.md`, `.claude/rules/output-format.md`, `.claude/rules/agents/agent-definition.md`, `.claude/rules/agents/agent-delegation.md`
- Active workspace contract: `.claude/CLAUDE.md`
- Verification contract: `.claude/verification.contract.yaml`
- Phase-specific guides: `.claude/docs/tasks/resumable-session-layer/work-plan.md`, `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md`
- Round policy summary: integrate only with harness-owned files and sample artifacts; avoid broad runtime redesign

## Review Cadence
- First review checkpoint: after the update rules, touchpoints, and sample package are drafted
- Re-review trigger: if policy or archive rules change
- Review owners: `codex-review-code`

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Update rules defined | contract | snapshot and append moments are explicit |
| Integration map bounded | architecture | touchpoints stay within harness-owned surfaces |
| Recovery proof exists | evidence | sample package demonstrates interruption, retry, and resume readability |
| Operational policy defined | policy | git/ignore/archive and manual edit rules are explicit |

## Traceability Exit Criteria
| ID | Type | Verification Path | Evidence Required |
|----|------|-------------------|-------------------|
| REQ-SL-8 | REQ | doc review | integration rules preserve current docs/skills role separation |
| SCN-SL-1 | SCN | sample walkthrough | interruption/resume sample reconstructs next action |
| SCN-SL-3 | SCN | sample walkthrough | human-readable stop reason and next action are obvious |

## Evaluator Focus
- integration plans that exceed harness-owned boundaries
- missing policy for mutable runtime data
- sample logs that still require chat replay to understand

## Evidence
- Required commands: `git diff --stat`
- Runtime flow: sample interruption/retry/resume walkthrough
- Screenshots/logs: sample runtime artifacts
- Requirements traceability update: master plan mapping
- Scenario matrix update: optional if created during execution
- UAT checklist state: not required in this round

## Finish Rule
- Clean finish requires: integration map, policy decisions, sample proof, review evidence, and closeout artifacts all agree
- Continue-now rule: if the sample still requires chat replay to understand, keep working
- Resume-later handoff trigger: the phase remains prepared but unexecuted
- Retry-loop trigger: sample package or policy is incomplete
- Target completion score: 100

## Risks
- touching global status defaults may conflict with unrelated work
- archive or git policy may be underspecified and cause later operational drift
