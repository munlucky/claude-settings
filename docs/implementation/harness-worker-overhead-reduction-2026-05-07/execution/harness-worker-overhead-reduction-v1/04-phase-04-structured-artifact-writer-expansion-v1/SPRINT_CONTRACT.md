# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Structured Artifact Writer Expansion (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/04-structured-artifact-writer-expansion-v1.md

## Goal
- Expand the structured artifact writer so closeout and workset bookkeeping can be updated idempotently without hand-patching the phase markdown artifacts.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.
- The selected atomic task updates only the targeted artifact sections and can be rerun without drift.

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/04-structured-artifact-writer-expansion-v1.md
- Goal:
  - Move phase artifact bookkeeping from LLM manual patching to deterministic, idempotent writer commands.
- Expected outcome:
  - Review-only and finish-closeout-only gaps are remediated without launching a new broad implementation worker.
  - QA_REPORT.md, SCORECARD.md, HANDOFF.md, and WORKSETS.yaml section updates are idempotent.
  - Worker prompts can instruct use of a structured writer command instead of hand-patching long markdown artifacts.
- Scope:
  - In scope:
    - Add or extend a single `sync-phase-artifacts` style command that accepts structured state and updates QA/SCORECARD/HANDOFF/WORKSETS.
    - Keep current `sync-closeout-artifacts`, `complete-review-closeout-from-verdict`, and `sync-clean-finish-artifacts` backward compatible.
    - Ensure writers can update review evidence, finish readiness, runtime updates, score payload, handoff marker, and active atomic task evidence.
    - Add idempotence tests that run the same writer twice and compare output.
  - Out of scope:
    - Replacing every historical markdown artifact.
    - Changing score target or completion criteria.
    - Changing `phase-status.yaml` rebuild logic.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P04-1 | Define structured artifact state | Define minimal JSON fields for stage, status, verdict path, review state, finish state, score, commands, changed files, and log path | Writer input has no ambiguous markdown prose dependency |
  | P04-2 | Implement writer command | Add command that updates QA/SCORECARD/HANDOFF/WORKSETS through section replacement | Same input is idempotent |
  | P04-3 | Update prompt instructions | Replace hand-patch guidance with writer command for artifact-only updates | Codex direct checklist names the writer path |
  | P04-4 | Preserve existing commands | Keep old writer commands working for current runner callers | Existing artifact self-test passes |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P04-1 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | self-test temp files | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | Exit 0; idempotent output |
  | P04-2 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | same | `node --check .claude/scripts/agent-loop-phase-artifacts.mjs` | Exit 0 |
  | P04-3 | none | `.claude/scripts/agent-loop-phase-plan-lib.mjs` | prompt text inspection | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` | Exit 0; prompt references writer |
  | P04-4 | none | existing artifacts commands | self-test | `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test` | Existing command behavior preserved |
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Fill before code changes.

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
- Selected model: gpt-5.4-mini
- Selected model effort: medium
- Model selection reason: stage=phase_implementation; profile=standard
- Retrieval budget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Planned Changes
- Files/modules:
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`
  - `.claude/scripts/agent-loop-phase-plan-lib.mjs`
- Interfaces/contracts:
  - Add or extend a structured artifact sync entrypoint for QA, SCORECARD, HANDOFF, and WORKSETS updates.
  - Preserve the existing closeout writer commands as backward-compatible call paths.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover, with the structured writer verified by rerunning the same input and comparing the outputs.
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
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-worker-overhead-reduction-2026-05-07 --master-plan docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/04-phase-04-structured-artifact-writer-expansion-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/04-phase-04-structured-artifact-writer-expansion-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/04-phase-04-structured-artifact-writer-expansion-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/04-phase-04-structured-artifact-writer-expansion-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: 2026-05-07 05:07:23
