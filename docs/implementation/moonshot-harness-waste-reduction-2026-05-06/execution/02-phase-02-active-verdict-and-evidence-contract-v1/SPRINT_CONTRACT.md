# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Active Verdict and Evidence Contract (v1)
- Source plan: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/02-active-verdict-evidence-contract-v1.md

## Goal
- Make completion gates consume only active, phase-relevant, run-relevant verification verdicts and stop missing-evidence loops with one explicit contract failure.

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
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/02-active-verdict-evidence-contract-v1.md
- Goal:
  - Make completion gates consume only active, phase-relevant, run-relevant verification verdicts.
- Expected outcome:
  - A stale failed verdict cannot override a newer successful phase verdict, and missing evidence produces one explicit stop reason.
- Scope:
  - In scope:
    - Normalize verdict metadata: `phaseNumber`, `runLeaseId`, `qaReportPath`, `sourcePlanPath`, `supersedes`.
    - Reuse one active verdict helper in runner/state logic.
    - Treat missing evidence as `verification_contract_failure`.
  - Out of scope:
    - Closeout markdown field synchronization.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P02-1 | Extend verdict schema | Add metadata args and payload fields in `write-verification-verdict.py` | Generated verdicts include phase/run/path metadata |
  | P02-2 | Centralize active verdict helper | Make stale/superseded/imported/phase-mismatched verdict filtering one reusable function | Runner and phase state use identical relevance rules |
  | P02-3 | Split blocker classes | Classify `verification_failed`, `content_precondition`, `verifier_unavailable`, and `missing_evidence` separately | Debug events show exact blocker class |
  | P02-4 | Stop missing evidence loops | Replace micro-retry path with one explicit stop when verdict path is missing | `missing-verification-evidence` does not spawn repeated workers |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P02-1 | none | `.claude/scripts/write-verification-verdict.py` | generated verdict fixture | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/mwr-verdict.json --run-id mwr-p02 --phase-number 2` | GREEN: payload includes metadata fields |
  | P02-2 | none | `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | self-tests and boundary tests | `node .claude/scripts/verification-verdict-state.mjs self-test` | RED: stale blocker active; GREEN: stale blocker inactive |
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
  - `.claude/scripts/write-verification-verdict.py`
  - `.claude/scripts/verification-verdict-state.mjs`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
- Interfaces/contracts:
  - Generated verdict metadata includes `phaseNumber`, `runLeaseId`, `qaReportPath`, `sourcePlanPath`, and `supersedes`.
  - Runner/state filtering uses one shared active-verdict relevance rule.
  - Missing verification evidence maps to a single `verification_contract_failure` stop path.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence; verify stale/superseded verdict rejection and single-stop missing-evidence handling.
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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}`

### Runtime Flow
- Runtime evidence depth: full for SCN-P02-1 and SCN-P02-2
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fresh evidence must include verdict metadata output and boundary behavior for missing evidence.

### Artifacts
- QA report: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/02-phase-02-active-verdict-and-evidence-contract-v1/QA_REPORT.md
- Handoff: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/02-phase-02-active-verdict-and-evidence-contract-v1/HANDOFF.md
- Scorecard: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/02-phase-02-active-verdict-and-evidence-contract-v1/SCORECARD.md
- Worksets: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/02-phase-02-active-verdict-and-evidence-contract-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 07:36:27
