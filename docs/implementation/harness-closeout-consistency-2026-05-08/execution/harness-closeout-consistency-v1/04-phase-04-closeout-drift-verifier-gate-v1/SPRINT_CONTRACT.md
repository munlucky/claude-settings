# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Closeout Drift Verifier Gate (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/04-closeout-drift-verifier-gate-v1.md

## Goal
- Closeout drift verification rejects contradictory workflow/session/lease state for completed phase claims while allowing explicit local fallback supersede states.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Demo-first MVP Gate
- Applies: no


## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/04-closeout-drift-verifier-gate-v1.md
- Goal:
  - `phase-status` completed + failed `current-run.completionStatus` without supersede must fail.
  - Session `task_complete` + failed workflow-enforcement state must fail.
  - Stale active lease root fields and future timestamps must fail.
  - Superseded fallback states must be accepted as normal completion evidence.
- Expected outcome:
  - Completion source-of-truth converges to one conclusion.
  - Contradictions without fallback supersede hard-fail.
- Scope:
  - Include workflow JSON readers for `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json`.
  - Include session JSONL fixture parsing limited to `task_complete`.
  - Include stale active lease root field detection and timestamp future violation.
  - Include superseded fallback allowlist.
  - Exclude arbitrary JSONL crawling, unrelated verifier taxonomy refactor, and non-closeout workflow policy changes.
- Detailed tasks:
  - P04-1 workflow contradiction reader.
  - P04-2 session contradiction reader.
  - P04-3 stale lease and future timestamp guard.
  - P04-4 fallback supersede allow rule.
- Exact execution targets:
  - `node .claude/scripts/verify-phase-closeout.test.mjs`
  - `node .claude/scripts/phase-closeout-reconciler.test.mjs`
  - `bash .claude/scripts/workflow-enforcement.sh verify`
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Arbitrary JSONL session crawling.
- Unrelated verifier taxonomy refactor.
- Non-closeout workflow policy changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Harness Selection
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase work uses the full cross-runtime harness by default.
- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract.
- Model effort profile: standard
- Effort escalation reason: none
- Selected model provider: openai
- Selected model: gpt-5.5
- Selected model effort: medium
- Model selection reason: stage=phase_implementation; profile=standard
- Retrieval budget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Planned Changes
- Files/modules:
  - `.claude/scripts/verify-phase-closeout.mjs`
  - `.claude/scripts/verify-phase-closeout.test.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`
- Interfaces/contracts:
  - Closeout verifier violation vocabulary for workflow/session/lease drift.
  - Workflow fallback supersede state accepted by closeout verifier.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Use fixture-backed tests to open prepared workflow/session state, mutate contradiction/fallback inputs, persist fixture files, recover by rerunning closeout/reconciler verification, and confirm violation/pass signals.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 04, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: auto

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| verify-phase-closeout.test | Test | Unsuperseded failed workflow, task_complete/workflow failed contradiction, stale lease, future timestamp, and fallback supersede fixtures produce expected pass/fail signals. |
| phase-closeout-reconciler.test | Test | Local fallback supersede after-state is accepted. |
| workflow-enforcement verify | Workflow | Workflow enforcement verification passes after implementation. |
| verify-plan-conformance | Contract | Active phase artifacts conform to the source phase plan before clean finish. |

## Evaluator Focus
- Core flow: completed phase closeout must fail when workflow/session/lease source-of-truth contradicts completion without supersede metadata.
- Edge cases: superseded delegated failure via local fallback, stale active root lease fields, and timestamps more than five seconds in the future.
- Stub-only behavior to reject: tests that only assert smoke execution without fixture mutation and violation code evidence.

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-closeout-consistency-2026-05-08 --master-plan docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: fixture-backed open -> act -> mutate -> persist -> recover evidence required for SCN-04-1 and SCN-04-2.
- Critical SCN-* minimum: open prepared fixture state -> act by invoking verifier/reconciler -> mutate contradiction or fallback inputs -> persist fixture/workflow files -> recover by rerunning the command and confirming deterministic signals.
- Verification runtime target: codex

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/04-phase-04-closeout-drift-verifier-gate-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/04-phase-04-closeout-drift-verifier-gate-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/04-phase-04-closeout-drift-verifier-gate-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/04-phase-04-closeout-drift-verifier-gate-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: existing workflow state schemas may already have partial supersede handling from earlier phases.
- Rollback or safe fallback: keep changes limited to closeout verifier and workflow fallback metadata; failing verification keeps phase in retry_loop.

## Notes
- Generated at: 2026-05-08 12:45:48
- Refreshed for Codex direct phase attempt at: 2026-05-08 21:46:21 +09:00
