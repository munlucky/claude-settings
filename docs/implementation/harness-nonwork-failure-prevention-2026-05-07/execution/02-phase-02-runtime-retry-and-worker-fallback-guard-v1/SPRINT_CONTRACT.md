# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Runtime Retry And Worker Fallback Guard (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/02-runtime-retry-worker-fallback-guard-v1.md

## Goal
- Keep runtime and verifier availability failures out of implementation auto-fix loops while preserving clean artifact verdicts.

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
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/02-runtime-retry-worker-fallback-guard-v1.md
- Goal:
  - Keep runtime and verifier availability failures out of implementation auto-fix loops.
- Expected outcome:
  - Worker attempts do not relaunch broad implementation when the actual failure is `spawn_blocked`, `verifier_unavailable`, `node_spawn_eperm`, Codex storage denied, or access denied.
  - Codex execution uses isolated/ephemeral state where supported and records fallback or blocker evidence when host storage is unavailable.
- Scope:
  - Included:
    - Add runtime stop reason detection for EPERM/access denied/spawn blocked/verifier unavailable/Codex storage denied.
    - Add one controlled fallback route when fallback is available: isolated Codex probe home or allowed alternate runtime.
    - Add retry suppression when `sameFailureClassCount >= 2` or a no-retry environment code is active.
    - Record delegated terminal exit code separately from normalized completion verdict.
  - Excluded:
    - Changing completion criteria for real verifier failures.
    - Editing verdict identity logic, phase status rebuild logic, or Git closeout logic.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P02-1 | Detect runtime-only failure logs | Extend stop-reason detection for Codex storage/session, readonly DB, Node EPERM, bash access denied, spawn blocked, verifier unavailable | Runtime failures produce environment stop reasons, not `phase-failed` |
  | P02-2 | Add controlled fallback policy | Use isolated Codex home or alternate runtime only once when policy allows | Fallback evidence records requested/effective runtime and reason |
  | P02-3 | Suppress worker auto-fix for environment blockers | Update attempt decisions so no-retry environment codes stop or hand off after fallback | Broad auto-fix prompt is not generated for environment blockers |
  | P02-4 | Separate terminal exit from normalized verdict | Preserve delegated terminal exit code in stop detail without overriding clean-finish artifacts | Status can show `lastStopReasonCode` while `normalizedRunVerdict` reflects artifact truth |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P02-1 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | existing runtime self-test fixtures or new inline self-test if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
  | P02-2 | none | `.claude/scripts/runtime-cli.mjs` | none | `node .claude/scripts/runtime-cli.mjs codex-probe-env /tmp/codex-probe-home-smoke` | Prints `HOME`, `CODEX_HOME`, `XDG_*` assignments |
  | P02-3 | none | `.claude/scripts/agent-loop-phase-attempt.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | none | `node --check .claude/scripts/agent-loop-phase-attempt.mjs && node --check .claude/scripts/agent-loop-phase-runner.mjs` | Exit 0 |
  | P02-4 | none | `.claude/scripts/agent-loop.mjs` if needed | none | `node --check .claude/scripts/agent-loop.mjs` | Exit 0 |
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
- `.claude/scripts/runtime-cli.mjs`
- `.claude/scripts/agent-loop-phase-runtime.mjs`
- `.claude/scripts/agent-loop-phase-runner.mjs`
- `.claude/scripts/agent-loop-phase-attempt.mjs`
- Interfaces/contracts:
- Runtime stop reasons distinguish environment blockers from implementation failures.
- Controlled fallback is one-shot and records requested/effective runtime details.
- Delegated terminal exit code is preserved without overriding normalized verdict semantics.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: SCN-P02-1 runtime decision smoke, SCN-P02-2 codex probe env smoke, SCN-P02-3 delegated terminal exit/status normalization smoke. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
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
| Runtime stop reasons | Test | Environment blockers map to environment stop reasons rather than implementation retry prompts |
| One-shot fallback | Test | Controlled fallback records requested/effective runtime details and does not loop |
| Normalized verdict separation | Test | Delegated terminal exit code stays separate from normalized verdict truth |

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
- Runtime evidence depth: SCN-P02-1, SCN-P02-2, SCN-P02-3
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Evidence capture is required before clean finish.

### Artifacts
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/02-phase-02-runtime-retry-and-worker-fallback-guard-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/02-phase-02-runtime-retry-and-worker-fallback-guard-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/02-phase-02-runtime-retry-and-worker-fallback-guard-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/02-phase-02-runtime-retry-and-worker-fallback-guard-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 01:22:34
