# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Commit Closeout Preflight And Regression Sync (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/06-commit-closeout-preflight-regression-sync-v1.md

## Goal
- Implement phase 06 closeout preflight, ignored-evidence staging, non-blocking MemoryGraph unavailable handling, stable HEAD reporting, and docs/verification sync.

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
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/06-commit-closeout-preflight-regression-sync-v1.md
- Goal:
  - Make final closeout predictable and ensure the full nonwork-failure prevention package is covered by regression checks and docs.
- Expected outcome:
  - Git index permission, ignored verdict artifacts, deny-pattern staging, MemoryGraph unavailable, and HEAD drift are detected before commit or final response.
  - New phase runner behavior is documented and covered by verification contract/checks.
- Scope:
  - Included:
    - Add `phase-final-git-closeout.mjs preflight` or equivalent preflight mode.
    - Probe Git index write capability before staging/commit.
    - Detect ignored evidence that must be included with `git add -f` while preserving deny-pattern exclusions.
    - Record MemoryGraph unavailable as `promotion_write_unavailable` or non-blocking closeout warning unless strict memory validation applies.
    - Re-read `HEAD` after commit and before final closeout reporting.
    - Update docs and verification contract for new commands/schema where needed.
  - Excluded:
    - Automatically pushing commits or creating PRs.
    - Making MemoryGraph direct write mandatory.
    - Rewriting prior implementation package closeout artifacts.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P06-1 | Add Git closeout preflight | Check index lock/write probe, ignored evidence, deny patterns, worktree dirtiness, and incomplete phase artifacts | Preflight reports exact next action before commit |
  | P06-2 | Harden checkpoint commit | Use preflight output to stage valid ignored evidence with force when required and block denied runtime/cache paths | Commit code cannot silently omit required evidence |
  | P06-3 | Separate MemoryGraph unavailable | Record MemoryGraph direct/MCP unavailable as non-blocking closeout status unless strict mode requested | MemoryGraph failure does not change phase pass/fail |
  | P06-4 | Pin HEAD reporting | Re-read `HEAD` after commit and final closeout; report stable commit id even if follow-up operations occur | Final closeout has fixed commit metadata |
  | P06-5 | Sync docs and regression contract | Update verification contract/guidelines with new commands and run full regression set | Knowledge audit passes |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P06-1 | none | `.claude/scripts/phase-final-git-closeout.mjs` | self-test in same file | `node .claude/scripts/phase-final-git-closeout.mjs self-test` | Self-test covers clean, dirty, ignored evidence, denied staging, git failure |
  | P06-2 | none | `.claude/scripts/phase-checkpoint-commit.mjs` | self-test in same file | `node .claude/scripts/phase-checkpoint-commit.mjs self-test` | Commit fixture passes and denied paths are excluded |
  | P06-3 | none | `.claude/scripts/commit-moonshot-memory-refresh.mjs` | none | `node .claude/scripts/commit-moonshot-memory-refresh.mjs --mcp-status skipped --json` | JSON reports non-blocking direct status/log path |
  | P06-4 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | boundary verifier | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |
  | P06-5 | docs as needed | `.claude/verification.contract.yaml`, docs guidelines/reference | repository audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Audit passes |
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
  - `.claude/scripts/phase-final-git-closeout.mjs`
  - `.claude/scripts/phase-checkpoint-commit.mjs`
  - `.claude/scripts/commit-moonshot-memory-refresh.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/verification.contract.yaml`
  - `.claude/docs/guidelines/`
  - `.claude/docs/reference/`
  - `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/`
- Interfaces/contracts:
  - Add or harden closeout preflight behavior for Git index writes, ignored evidence, deny-pattern exclusions, and HEAD refresh.
  - Keep MemoryGraph unavailable as a non-blocking closeout status unless strict mode is explicitly requested.
  - Keep documentation and verification contract synchronized with the new closeout flow and checks.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 06, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- Runtime evidence depth: planned
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Evidence will be recorded in QA_REPORT.md before verification claims.

### Artifacts
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/06-phase-06-commit-closeout-preflight-and-regression-sync-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/06-phase-06-commit-closeout-preflight-and-regression-sync-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/06-phase-06-commit-closeout-preflight-and-regression-sync-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/06-phase-06-commit-closeout-preflight-and-regression-sync-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 02:35:19
