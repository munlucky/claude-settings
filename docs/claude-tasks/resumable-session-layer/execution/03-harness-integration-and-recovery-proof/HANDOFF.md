# HANDOFF

## Goal
- Current objective: connect the session model back to the harness and prove recovery with a sample package
- Current stage: finish / handoff

## Current State
- Completed: phase 3 integration rules, operational policy, committed recovery sample, review notes, and clean-finish marker
- In progress: none
- Blocked: no hard blocker
- Open `REQ-*` / `SCN-*`: none for phase 3 scope

## Decisions
- Decision: keep live runtime state under `runtime/` and committed proof artifacts under `samples/`
- Reason: mutable operational state and committed documentation examples have different lifecycle needs

## Open Risks
- Risk: integration rules may drift from future runtime writer behavior
- Impact: later implementation could diverge from the documented acceptance baseline

## Resume Trigger
- Why this handoff exists: clean finish marker for the completed final phase
- Stop reason: clean_finish
- Why this cannot continue in the current round: phase 3 scope is complete
- Condition to resume: reopen only if runtime writers or runtime storage policy need implementation changes

## Checks To Rerun
- Review: rerun `codex-review-code` if the writer timing matrix, touchpoints, or sample package changes
- Verification: rerun repository checks and sample recovery walkthrough review if phase 3 artifacts change
- Runtime flow: sample interruption/retry/resume walkthrough
- Traceability artifacts: sample package and master plan mapping

## Next Steps
1. Use the committed sample package as the baseline if runtime writers are implemented later.
2. Keep mutable runtime data under `runtime/` and committed examples under `samples/`.
3. Leave the repository-level parity warning recorded until the shell-path issue is fixed.

## Remaining Scope
- Remaining in-scope work: none for phase 3
- Next planned phase or slice: none; this is the final planned phase

## Evidence Paths
- Sprint contract: `.claude/docs/tasks/resumable-session-layer/execution/03-harness-integration-and-recovery-proof/SPRINT_CONTRACT.md`
- QA report: `.claude/docs/tasks/resumable-session-layer/execution/03-harness-integration-and-recovery-proof/QA_REPORT.md`
- Scorecard: `.claude/docs/tasks/resumable-session-layer/execution/03-harness-integration-and-recovery-proof/SCORECARD.md`
- Requirements traceability:
- Scenario matrix:
- UAT checklist:
- Key files: `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md`, `.claude/docs/tasks/resumable-session-layer/samples/phase03-recovery/`
- Branch / commit:
