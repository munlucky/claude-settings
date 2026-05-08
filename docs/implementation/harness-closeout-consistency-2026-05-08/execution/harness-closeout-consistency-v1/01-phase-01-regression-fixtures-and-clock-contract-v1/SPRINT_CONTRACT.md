# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Regression Fixtures and Clock Contract (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/01-regression-fixtures-clock-contract-v1.md

## Goal
- Create synthetic regression fixtures for the six observed closeout consistency defects and establish a deterministic injected-clock contract for timestamp validation.

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
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/01-regression-fixtures-clock-contract-v1.md
- Goal:
  - Reproduce the observed six defects with synthetic fixtures without depending on historical session files.
  - Make timestamp validation deterministic through an injected clock instead of wall-clock coupling.
- Expected outcome:
  - New drift, future-timestamp, and environment-blocked fixtures fail against the current implementation where later phases are expected to make them pass.
- Scope:
  - Include delegated-terminal failed plus local fallback complete fixture.
  - Include failed `current-run.json` plus completed `phase-status.yaml` fixture.
  - Include completed status with stale `activeRunLeaseId` fixture.
  - Include future timestamp fixture.
  - Include session `task_complete` plus workflow failed fixture.
  - Include environment-blocked smoke plus plan complete fixture.
  - Exclude reconciler implementation, verifier hard-fail implementation, and runtime-state SQLite schema changes.
- Detailed tasks:
  - P01-1: create fixture helpers for temp roots, phase-status/workflow/session jsonl writers, and fixed clock injection.
  - P01-2: add `.claude/scripts/phase-closeout-reconciler.test.mjs` with drift assertions and expected shape for later implementation.
  - P01-3: add contradiction, stale, future, and environment cases to `.claude/scripts/verify-phase-closeout.test.mjs` with explicit expected violation codes.
  - P01-4: add optional `.claude/scripts/lib/clock.test.mjs` shell for `nowIso()` provider or equivalent helper and future timestamp determinism.
- Exact execution targets:
  - `node .claude/scripts/phase-closeout-reconciler.test.mjs`
  - `node .claude/scripts/verify-phase-closeout.test.mjs`
  - `node .claude/scripts/prepare-implementation-plan-state.test.mjs`
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not implement the reconciler, verifier hard-fail behavior, or runtime-state SQLite schema changes in this phase.

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
- Selected model: gpt-5.5
- Selected model effort: medium
- Model selection reason: stage=phase_implementation; profile=standard
- Retrieval budget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Planned Changes
- Files/modules: `.claude/scripts/phase-closeout-reconciler.test.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs`, optional `.claude/scripts/lib/clock.test.mjs`
- Interfaces/contracts: deterministic injected-clock validation contract and explicit closeout violation-code expectations for later phases.

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
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Six synthetic defects | Test | Each in-scope defect has an independent synthetic fixture assertion |
| Deterministic timestamp contract | Test | Future timestamp validation is based on an injected clock expectation |
| Red baseline accepted | Test | Expected failures are documented as phase-appropriate red baseline evidence for later phases |

## Evaluator Focus
- Core flow: fixture setup produces realistic phase-status, workflow, and session evidence without historical files.
- Edge cases: stale lease IDs, contradictory run states, future timestamps, and environment-blocked smoke evidence.
- Stub-only behavior to reject: fixtures that only assert file existence or generic failure without field-level defect signals.

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-closeout-consistency-2026-05-08 --master-plan docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/01-phase-01-regression-fixtures-and-clock-contract-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/01-phase-01-regression-fixtures-and-clock-contract-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/01-phase-01-regression-fixtures-and-clock-contract-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/01-phase-01-regression-fixtures-and-clock-contract-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: exact violation codes may need later phase alignment, but this phase must preserve explicit expected names rather than vague failure assertions.
- Rollback or safe fallback: keep tests isolated to synthetic temp roots and avoid production runtime-state schema mutations.

## Notes
- Generated at: 2026-05-08 12:22:10
