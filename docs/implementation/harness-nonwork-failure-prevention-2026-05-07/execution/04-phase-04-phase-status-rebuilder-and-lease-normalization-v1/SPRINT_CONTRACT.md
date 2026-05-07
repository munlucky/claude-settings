# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Phase Status Rebuilder And Lease Normalization (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/04-phase-status-rebuilder-lease-normalization-v1.md

## Goal
- Implement the phase-status rebuild command and finished-run lease normalization so root status can be regenerated from authoritative phase artifacts and runtime events.

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
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/04-phase-status-rebuilder-lease-normalization-v1.md
- Goal:
  - Repair phase ledger inconsistencies without manual YAML editing and prevent stale root execution fields from surviving finished runs.
- Expected outcome:
  - A new `rebuild-phase-status` command can regenerate status counters, attempts, completed timestamps, artifact paths, active root fields, and goal runtime mirror from authoritative phase artifacts and runtime events.
  - Finished runs have coherent root status: no stale `activeCurrentStage: ready/isolate`, no active phase number, no stale signals/artifacts block, and normalized run verdict separate from terminal exit details.
- Scope:
  - Included:
    - Add `agent-loop-phase-state.mjs rebuild-phase-status <status-file> <plan-dir>`.
    - Recalculate phase counters from phase blocks and clean-finish artifacts.
    - Create an attempt/event record for manual closeout when completed artifacts exist but `attempts.total=0`.
    - Normalize finished root lease fields and remove stale `signals`/`artifacts` active pointers.
    - Keep delegated terminal exit metadata as stop detail without changing clean artifact truth.
  - Excluded:
    - Preparing a new active phase package.
    - Editing completed prior plan docs.
    - Changing verdict identity rules.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P04-1 | Add status rebuild command | Parse plan phases, phase artifact paths, QA/SCORECARD/HANDOFF clean-finish state, and runtime event ledger | Command outputs or writes coherent status without touching unrelated plans |
  | P04-2 | Normalize finished root fields | On finished/complete with no actionable phases, set current stage/phase to null or finish, remove active pointers, update counters | Current known stale pattern is corrected by fixture |
  | P04-3 | Reconcile attempts and timestamps | If phase completed via manual closeout with zero attempts, add synthetic closeout event metadata | `attempts.total=0` plus passed state cannot remain after rebuild |
  | P04-4 | Add self-test fixtures | Build temp status files for stale stage, timestamp inversion, delegated exit mismatch, and zero attempts | `agent-loop-phase-state self-test` covers rebuild behavior |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P04-1 | none | `.claude/scripts/agent-loop-phase-state.mjs` | self-test in same file | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Includes rebuild fixture pass |
  | P04-2 | none | `.claude/scripts/phase-run-lease.mjs`, `.claude/scripts/runtime-state.mjs` if needed | boundary verifier | `bash .claude/scripts/verify-phase-runner-boundary.sh` | Boundary smoke passes |
  | P04-3 | none | `.claude/scripts/agent-loop.mjs` if needed | none | `node --check .claude/scripts/agent-loop.mjs` | Exit 0 |
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
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/agent-loop.mjs`
- Interfaces/contracts:
  - `rebuild-phase-status <status-file> <plan-dir>` command in `agent-loop-phase-state.mjs`
  - finished-root normalization for active stage/phase, active pointers, and runtime mirrors
  - synthetic closeout event handling when completed artifacts exist but attempts are zero

## Contract Review
- Contract reviewed by evaluator: in_progress
- Verification owner: completion-verifier
- Runtime evidence plan: self-test fixture output, boundary verifier output, and plan-conformance evidence; critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: bounded to phase 04 and active atomic task `AT-01`.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 04, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: auto

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Rebuild command usage output | Test | `node .claude/scripts/agent-loop-phase-state.mjs self-test` includes rebuild fixture pass |
| Finished root normalization | API/Test | stale root stage/phase pointers are cleared on finished runs |
| Attempt reconciliation | Test | manual closeout with zero attempts gets synthetic closeout metadata |

## Evaluator Focus
- Core flow: rebuild root status from authoritative phase artifacts and runtime events without mutating unrelated plans.
- Edge cases: finished runs with stale active pointers, zero-attempt manual closeouts, and delegated exit metadata mismatch.
- Stub-only behavior to reject: pass-through wrappers that do not normalize root status or reconcile attempts.

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
- Runtime evidence depth: open -> act -> mutate -> persist -> recover
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/04-phase-04-phase-status-rebuilder-and-lease-normalization-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/04-phase-04-phase-status-rebuilder-and-lease-normalization-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/04-phase-04-phase-status-rebuilder-and-lease-normalization-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/04-phase-04-phase-status-rebuilder-and-lease-normalization-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 01:57:10
