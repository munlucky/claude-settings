# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Path Authority Fail-fast (v1)
- Source plan: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/01-path-authority-fail-fast-v1.md

## Goal
- Keep the phase-01 path-authority fail-fast fixes, verification, and closeout evidence aligned for this isolated attempt.

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
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/01-path-authority-fail-fast-v1.md
- Goal:
  - Stop `master-plan-missing` and related path authority failures before spawning implementation workers.
- Expected outcome:
  - A phase run with missing or mismatched `masterPlan`, `planDir`, or `phaseStatusFile` exits with a path-authority stop reason and no worker prompt launch.
- Scope:
  - In scope:
    - Add path authority preflight for master plan, status file, plan dir, execution root, and active artifact paths.
    - Make `verify-phase-closeout.mjs` distinguish missing supplied master plan from missing default fallback.
    - Add debug events for `path-authority-preflight-failed`.
  - Out of scope:
    - Changing verdict parsing or coordinator lifecycle behavior.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P01-1 | Define path authority classifier | Add canonical codes for `path_authority_failure`, `master_plan_missing`, `phase_status_missing`, `plan_dir_missing`, `artifact_path_missing` | Classifier returns stable codes used by closeout and runner |
  | P01-2 | Closeout strict path mode | Require explicit master plan when phase run config supplies one; remove silent default fallback for active phase closeout | Wrong default path fixture fails with `master-plan-missing` before checklist parsing |
  | P01-3 | Worker preflight | Run path authority check before `worker-prompt-start` in `agent-loop-phase-runner.mjs` | Missing master plan produces no `worker-prompt-start` |
  | P01-4 | Boundary regression | Extend `verify-phase-runner-boundary.sh` and closeout unit tests | Boundary verifier catches default fallback regression |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P01-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | RED: missing explicit path accepted; GREEN: missing explicit path fails |
  | P01-2 | none | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop.mjs` | `.claude/scripts/verify-phase-runner-boundary.sh` | `bash .claude/scripts/verify-phase-runner-boundary.sh` | RED: worker starts; GREEN: fail-fast before worker |
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not widen scope beyond phase 01 or change unrelated verifier/coordinator behavior.

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
  - `.claude/scripts/lib/path-authority.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`
  - `.claude/scripts/verify-phase-closeout.test.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop.mjs`
  - `.claude/scripts/verify-phase-runner-boundary.sh`
- Interfaces/contracts:
  - Path authority preflight returns canonical codes and fails before worker launch when the explicit master plan, status file, plan directory, execution root, or active artifact paths are invalid.
  - Closeout no longer falls back silently to a default master plan path.

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Path-authority smoke must prove open -> act -> mutate -> persist -> recover is not needed for this phase because it is a harness boundary; instead record fail-fast debug evidence and runner-stop evidence before worker launch.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Preserve explicit master-plan candidates so missing versus unspecified paths remain distinguishable during preflight and closeout.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 01, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/01-phase-01-path-authority-fail-fast-v1/QA_REPORT.md
- Handoff: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/01-phase-01-path-authority-fail-fast-v1/HANDOFF.md
- Scorecard: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/01-phase-01-path-authority-fail-fast-v1/SCORECARD.md
- Worksets: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/01-phase-01-path-authority-fail-fast-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 07:02:09
