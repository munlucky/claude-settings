# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Verdict Identity And Staleness Guard (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/03-verdict-identity-staleness-guard-v1.md

## Goal
- Prevent stale or cross-run structured verdicts from affecting the active phase completion and runtime health paths.

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
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/03-verdict-identity-staleness-guard-v1.md
- Goal:
  - Prevent old or cross-run structured verdicts from blocking current runtime health or phase completion.
- Expected outcome:
  - Verdict selection accepts only files matching the active phase plus identity constraints when identity fields are present.
  - Older blocked verdicts with mismatched `runLeaseId`, `planDir`, `statusFile`, or `gitTreeFingerprint` are treated as stale/inactive.
- Scope:
  - Included:
    - Add verdict schema v3 identity object: `runLeaseId`, `planDir`, `statusFile`, `gitTreeFingerprint`.
    - Add fallback compatibility for v2 verdicts without identity fields.
    - Add `staleReason`/inactive reporting for mismatches.
    - Extend runtime health and completion gate verdict filtering through existing `isRelevantVerificationVerdict`.
  - Excluded:
    - Rebuilding `phase-status.yaml`.
    - Changing runtime parity verdict levels.
    - Changing phase closeout artifact sync.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P03-1 | Extend verdict writer | Add optional CLI args and payload `identity` fields; compute git tree fingerprint when supplied or via caller-provided value | Writer remains backward compatible and `py_compile` passes |
  | P03-2 | Enforce identity relevance | Update normalization/relevance checks to mark mismatched identity stale/inactive | Self-test covers mismatched lease, plan, status, and git tree |
  | P03-3 | Preserve explicit references | Keep explicit QA-referenced verdict paths valid only when not stale/superseded and identity matches | Completion gate cannot revive stale explicit verdicts |
  | P03-4 | Surface stale reason | Runtime health detail includes stale reason and ignored verdict path when useful | QA can cite why old blocker was ignored |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P03-1 | none | `.claude/scripts/write-verification-verdict.py` | none | `python3 -m py_compile .claude/scripts/write-verification-verdict.py` | Exit 0 |
  | P03-2 | none | `.claude/scripts/verification-verdict-state.mjs` | existing self-test in same file | `node .claude/scripts/verification-verdict-state.mjs self-test` | Includes identity mismatch stale fixtures |
  | P03-3 | none | `.claude/scripts/verification-verdict-state.mjs` | same | `node --check .claude/scripts/verification-verdict-state.mjs` | Exit 0 |
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
- Interfaces/contracts:
  - Add optional verdict identity payload fields for `runLeaseId`, `planDir`, `statusFile`, and `gitTreeFingerprint`.
  - Treat mismatched identity as stale/inactive while preserving legacy v2 verdict compatibility.
  - Surface stale reason and ignored verdict path details where the runtime health path can report them.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Self-test the identity guard with mismatched lease, plan, status, and git tree fixtures plus legacy v2 compatibility; keep the evidence in the phase QA report.
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
- Verification runtime target: auto

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Verdict identity writer | Test | `python3 -m py_compile .claude/scripts/write-verification-verdict.py` exits 0 |
| Verdict relevance guard | Test | `node .claude/scripts/verification-verdict-state.mjs self-test` reports stale identity fixtures and legacy v2 compatibility |
| Syntax guard | Test | `node --check .claude/scripts/verification-verdict-state.mjs` exits 0 |

## Evaluator Focus
- Core flow: identity-aware verdict filtering accepts only active verdicts for the current phase and runtime.
- Edge cases: legacy v2 verdicts remain relevant when identity is absent; mismatched lease, plan, status, or tree fingerprint marks verdict stale.
- Stub-only behavior to reject: path-only matching that ignores identity, or explicit QA references that revive stale verdicts.

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
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/03-phase-03-verdict-identity-and-staleness-guard-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/03-phase-03-verdict-identity-and-staleness-guard-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/03-phase-03-verdict-identity-and-staleness-guard-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/03-phase-03-verdict-identity-and-staleness-guard-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 01:47:40
