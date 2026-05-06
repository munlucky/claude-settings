# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Dispatch Lifecycle and Retry Suppression (v1)
- Source plan: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/03-dispatch-lifecycle-retry-suppression-v1.md

## Goal
- Implement the phase 03 dispatch lifecycle guards that suppress restart loops, scope stale cleanup, and move dirty-worktree preflight ahead of expensive dispatch.

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
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/03-dispatch-lifecycle-retry-suppression-v1.md
- Goal:
  - Prevent control-plane loops from consuming worker time when no implementation progress is possible.
- Expected outcome:
  - Coordinator fork-unavailable, repeated clean exit with actionable phases, signal-like no-closeout, and dirty worktree preconditions stop or route deterministically.
- Scope:
  - In scope:
    - Preflight Codex in-session coordinator fork capability.
    - Stop signal-like delegated terminal no-closeout restarts.
    - Scope stale worker termination.
    - Surface worktree fallback count and reason.
    - Run final git closeout preflight before expensive dispatch.
  - Out of scope:
    - Verdict schema changes.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P03-1 | Coordinator route preflight | Detect unavailable Codex fork path before launching coordinator | No `in-session-coordinator-restart-cap` when delegated route is required |
  | P03-2 | No-progress restart guard | Compare phase status/artifact checksum before restart | Restart blocked when no artifact or status progress occurred |
  | P03-3 | No-closeout signal stop | Replace signal-like restart with stop when closeout is absent | `delegated-terminal-signal-no-closeout` has no restart event after it |
  | P03-4 | Scoped stale cleanup | Match worker cleanup against run lease id and command signature | Cleanup ignores unrelated Codex/agent processes |
  | P03-5 | Early dirty worktree audit | Run final-git preflight before delegated launch | Dirty worktree failure occurs before child launch |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P03-1 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/verify-phase-runner-boundary.sh` | `bash .claude/scripts/verify-phase-runner-boundary.sh` | RED: restart-cap; GREEN: deterministic route/stop |
  | P03-2 | none | `.claude/scripts/phase-run-lease.mjs`, `.claude/scripts/phase-worktree-coordinator.mjs` | boundary verifier | `node --check .claude/scripts/phase-run-lease.mjs` | GREEN: syntax and boundary checks pass |
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
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/phase-worktree-coordinator.mjs`
  - `.claude/scripts/verify-phase-runner-boundary.sh`
- Interfaces/contracts:
  - Preserve restart suppression stop reasons and lease return semantics for Codex in-session coordinator fallback.
  - Keep the phase boundary verifier as the required evidence source for this slice.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Use the boundary verifier plus targeted script self-tests to show restart suppression, lease gating, and dirty-worktree preflight. Critical SCN-* scenarios still require open -> act -> mutate -> persist -> recover evidence if the run reaches verification.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 03, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/03-phase-03-dispatch-lifecycle-and-retry-suppression-v1/QA_REPORT.md
- Handoff: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/03-phase-03-dispatch-lifecycle-and-retry-suppression-v1/HANDOFF.md
- Scorecard: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/03-phase-03-dispatch-lifecycle-and-retry-suppression-v1/SCORECARD.md
- Worksets: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/03-phase-03-dispatch-lifecycle-and-retry-suppression-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 08:25:01
