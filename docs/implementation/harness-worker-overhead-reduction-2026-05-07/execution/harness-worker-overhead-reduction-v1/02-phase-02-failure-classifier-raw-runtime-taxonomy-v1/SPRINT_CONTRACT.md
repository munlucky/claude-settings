# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Failure Classifier Raw Runtime Taxonomy (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/02-failure-classifier-raw-runtime-taxonomy-v1.md

## Goal
- Ensure every user-listed raw runtime warning string maps to a stable failure code and retry policy in this attempt.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked for the selected atomic task.
- Review, verification, scorecard, and handoff evidence agree before any clean-finish claim.
- Only one atomic task is advanced in this attempt.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Demo-first MVP Gate
- Applies: no


## Stop Rules
- Continue while actionable atomic tasks remain in this phase.
- Stop only on clean phase completion, a recorded blocker, or user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/02-failure-classifier-raw-runtime-taxonomy-v1.md
- Goal:
  - Ensure every user-listed raw runtime warning string maps to a stable failure code and retry policy.
- Expected outcome:
  - `Failed to terminate MCP process group ... Operation not permitted` maps to `mcp_cleanup_eperm`.
  - `Could not resolve host: github.com` and plugin sync failures map to network/plugin codes.
  - `could not update PATH: Operation not permitted` maps to `path_update_denied`.
  - Existing MemoryGraph, Codex storage, Git, Bash, Node, rg, verifier, and spawn blockers remain covered.
- Scope:
  - In scope:
    - Add raw-string classifier fixtures copied from user-observed logs.
    - Distinguish cleanup noise, network/plugin fetch failure, PATH mutation denial, and general network fetch failure.
    - Keep environment blockers out of implementation auto-fix loops through existing `isEnvironmentStopReason` consumers.
    - Ensure `detectFinalStopReason` can return stable environment codes when the log contains these strings.
  - Out of scope:
    - Adding new external network probes.
    - Changing Docker optional warning behavior unless it is directly needed for no-retry consistency.
    - Rewriting historical capability reports.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P02-1 | Add raw classifier patterns | Extend regexes for MCP terminate/kill, PATH update denied, plugin sync failed, could-not-resolve-host | Raw observed strings no longer map to `unknown_failure` |
  | P02-2 | Add fixture matrix | Add tests for every raw string from the overhead list | `node --test .claude/scripts/lib/failure-classifier.test.mjs` passes |
  | P02-3 | Wire stop reason detection | Ensure `detectFinalStopReason` sees these strings as environment/network stop reasons | Nonzero worker logs stop as stable blocker instead of broad auto-fix |
  | P02-4 | Preserve retry policy | Confirm no-retry environment/network codes do not become retryable implementation failures | Attempt decisions return stop-loop or controlled fallback |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P02-1 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Before fix: raw strings unknown; after fix: stable codes |
  | P02-2 | none | `.claude/scripts/lib/failure-classifier.test.mjs` | same | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Exit 0 |
  | P02-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | inline or test fixture if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0; stop detection returns stable code in fixture |
  | P02-4 | none | `.claude/scripts/agent-loop-phase-attempt.mjs` only if needed | none | `node .claude/scripts/agent-loop-phase-attempt.mjs decide-failure-action 1 3 true false mcp_cleanup_eperm` | `ACTION='stop-loop'` |
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
  - .claude/scripts/lib/failure-classifier.mjs
  - .claude/scripts/lib/failure-classifier.test.mjs
  - .claude/scripts/agent-loop-phase-runtime.mjs
  - .claude/scripts/agent-loop-phase-attempt.mjs if the fallback action mapping needs a guard adjustment
- Interfaces/contracts:
  - Keep raw-runtime classification stable for cleanup, network/plugin, PATH, and general network warning strings.
  - Preserve no-retry environment stop reasons for stable blocker handling.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: SCN-P02-1 through SCN-P02-3 will be exercised via `node --test .claude/scripts/lib/failure-classifier.test.mjs`; representative no-retry action mapping will be checked after implementation; runtime syntax checks stay in scope for this attempt.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 02, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: auto

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

### Attempt Notes
- Attempt mode: phaseAttemptMode=true
- Active atomic task: AT-01
- Verification runtime target: codex
- Workset policy: advance only AT-01 in this attempt

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 04:46:47
