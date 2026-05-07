# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Verdict RequiredChecks Contract (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/01-verdict-required-checks-contract-v1.md

## Goal
- Fill before code changes with the user-visible outcome for this round.

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/01-verdict-required-checks-contract-v1.md
- Goal:
  - Make `requiredChecks.missing` a machine-only list where "no missing checks" is always `[]`.
- Expected outcome:
  - `write-verification-verdict.py --missing-check none` and equivalent placeholders produce `requiredChecks.missing: []`.
  - Real missing check names remain in `requiredChecks.missing` and still fail the completion gate.
  - Gate logic defensively ignores legacy placeholder values without weakening real missing evidence enforcement.
- Scope:
  - In scope:
    - Normalize `none`, `없음`, `n/a`, `na`, `null`, and empty strings in missing-check inputs to an empty list.
    - Keep `expected` and `passed` as actual check-name lists; placeholder values there must fail with a clear usage error.
    - Add gate-side normalization for legacy verdict files already containing placeholder missing values.
    - Add self-test or unit fixtures for placeholder and real missing values.
  - Out of scope:
    - Redesigning the full verdict schema.
    - Relaxing `evidenceFresh`, `blocking`, `score`, or command pass requirements.
    - Rewriting historical verdict artifacts.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P01-1 | Add writer normalization | Add helper that normalizes missing-check placeholders to `[]` before payload, fingerprints, score inference, and blocker inference | Placeholder missing values do not appear in output JSON |
  | P01-2 | Reject invalid expected/passed placeholders | Add validation for `--expected-check` and `--passed-check` so placeholder values fail fast | Writer exits nonzero with a clear message for invalid expected/passed input |
  | P01-3 | Harden gate normalization | Normalize legacy `requiredChecks.missing` before checking `missingRequiredChecks` | Legacy `"none"` does not fail; real values still fail |
  | P01-4 | Add regression coverage | Add fixtures through writer command and gate/self-test path | Placeholder and real-missing scenarios are both covered |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P01-1 | none | `.claude/scripts/write-verification-verdict.py` | `/tmp/hwo-verdict-none.json` | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/hwo-verdict-none.json --run-id hwo-none --phase-number 1 --expected-check smoke --passed-check smoke --missing-check none` | Before fix: `"missing": ["none"]`; after fix: `"missing": []` |
  | P01-2 | none | `.claude/scripts/write-verification-verdict.py` | none | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/hwo-invalid.json --run-id hwo-invalid --phase-number 1 --expected-check none` | Nonzero exit with validation message |
  | P01-3 | none | `.claude/scripts/agent-loop-phase-state.mjs` | existing self-test fixtures or added inline fixture | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Exit 0 and real missing checks still fail |
  | P01-4 | none | `.claude/scripts/verification-verdict-state.mjs` if shared helper is placed there | same | `node .claude/scripts/verification-verdict-state.mjs self-test` | Exit 0 |
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
- Interfaces/contracts:

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Define before implementation. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

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
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/01-phase-01-verdict-requiredchecks-contract-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/01-phase-01-verdict-requiredchecks-contract-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/01-phase-01-verdict-requiredchecks-contract-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/01-phase-01-verdict-requiredchecks-contract-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 04:35:29

