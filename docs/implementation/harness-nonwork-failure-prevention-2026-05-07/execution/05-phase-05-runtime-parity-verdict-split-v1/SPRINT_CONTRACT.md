# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Runtime Parity Verdict Split (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/05-runtime-parity-verdict-split-v1.md

## Goal
- Prevent runtime parity smoke runs from collapsing skipped or warning-only probe execution into a full-exercise verdict.

## Success Criteria
- `runtimeExerciseLevel` is emitted in runtime parity verdicts and distinguishes skipped, warning, exercised, and full cases.
- Skipped real Codex probes do not close as `fully_exercised`.
- Review, verification, scorecard, and handoff evidence agree before any finish claim.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update only the runtime-parity verifier scripts in scope and record durable evidence in the active execution artifacts.

## Demo-first MVP Gate
- Applies: no


## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/05-runtime-parity-verdict-split-v1.md
- Goal:
  - Stop skipped or partially exercised runtime parity probes from being reported as full pass.
- Expected outcome:
  - Runtime parity output distinguishes:
    - `passed`
    - `passed_with_environment_warning`
    - `passed_with_skipped_probe`
    - `fully_exercised`
  - Real Codex probe skipped cannot close as full exercise.
- Scope:
  - Included:
    - Add `runtimeExerciseLevel` semantics to runtime parity verdicts.
    - Preserve environment warnings without claiming full runtime exercise.
    - Ensure skipped Codex probes produce `passed_with_skipped_probe` or a clear blocker, depending on policy.
    - Emit structured evidence that Phase 03 can evaluate.
  - Excluded:
    - Changing runtime selection policy.
    - Changing worker fallback policy.
    - Changing closeout contract beyond documenting new evidence semantics.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P05-1 | Define exercise levels | Add shell/core output markers and JS wrapper parsing for skipped/warning/exercised/full | Output is unambiguous in compact and normal modes |
  | P05-2 | Write split verdicts | Ensure runtime parity verdict uses `runtimeExerciseLevel` and Phase 03 identity fields | Structured verdict does not claim full exercise when probes are skipped |
  | P05-3 | Add fixture coverage | Add shell-core fixture paths or self-test mode if available | Runtime parity smoke covers skipped-probe behavior |
  | P05-4 | Preserve strict failures | Real parity mismatch or required runtime unavailable still fails according to existing policy | No downgrade of real failures to warnings |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P05-1 | none | `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | none | `bash -n .claude/scripts/verify-phase-runtime-parity-shell-core.sh` | Exit 0 |
  | P05-2 | none | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity.sh` | none | `node --check .claude/scripts/verify-phase-runtime-parity.mjs && bash -n .claude/scripts/verify-phase-runtime-parity.sh` | Exit 0 |
  | P05-3 | none or fixture under ignored/temp path only | runtime parity scripts | existing parity smoke | `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan` | Output reports accurate exercise level |
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
  - `.claude/scripts/verify-phase-runtime-parity.mjs`
  - `.claude/scripts/verify-phase-runtime-parity.sh`
  - `.claude/scripts/verify-phase-runtime-parity-shell-core.sh`
- Interfaces/contracts:
  - Add `runtimeExerciseLevel` to the structured verdict payload and surface it in smoke output.
  - Preserve existing hard-failure behavior for unavailable or mismatched runtimes.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Capture parity output and structured verdict evidence for skipped, warning, exercised, and full cases; critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence when exercised here.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 05, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| runtimeExerciseLevel split | Test | Smoke output and structured verdict distinguish skipped, warning, exercised, and full cases |

## Evaluator Focus
- Core flow: runtime parity smoke updates verdicts with `runtimeExerciseLevel` and identity fields.
- Edge cases: skipped real Codex probes remain visible and cannot be reported as full exercise.
- Stub-only behavior to reject: any path that marks skipped real probes as `fully_exercised`.

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
- Attempt status: in_progress
- Active atomic task: AT-01
- Fill before runtime verification.
- Skipped-runtime accounting is patched; fresh smoke rerun is pending.

### Artifacts
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/05-phase-05-runtime-parity-verdict-split-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/05-phase-05-runtime-parity-verdict-split-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/05-phase-05-runtime-parity-verdict-split-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/05-phase-05-runtime-parity-verdict-split-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 02:13:30
