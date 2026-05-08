# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Lease and Timestamp Writer Contract (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md

## Goal
- Completed phase status no longer exposes live lease fields, while writer timestamps are produced through a single current-time provider with deterministic future-timestamp guard coverage.

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
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md
- Goal:
  - Completed status must not retain `activeRunLeaseId` or `activeExecutionHeartbeatAt` as live fields.
  - Existing lease information moves to `lastRunLeaseId` or `supersededRunLeaseId`; heartbeat is preserved as `lastExecutionHeartbeatAt`.
  - Closeout writers use a single `nowIso()` provider or an injected clock.
- Expected outcome:
  - Verifier fails completed status that still contains an active lease.
  - Writer-created `completedAt`, `lastUpdatedAt`, `goalRuntime.updatedAt`, and workflow state `updatedAt` do not exceed `now + 5 seconds`.
- Scope:
  - Include reusable `nowIso()` provider, test-only injected clock support, completed/superseded lease field migration, and future timestamp guard plumbing.
  - Exclude timestamp format redesign, historical artifact rewrite, and SQLite runtime-state redesign.
- Detailed tasks:
  - P03-1: implement `.claude/scripts/lib/clock.mjs` and deterministic injected-clock test coverage.
  - P03-2: update `.claude/scripts/phase-run-lease.mjs` finish semantics so completed status removes live active lease fields and preserves audit fields.
  - P03-3: apply timestamp helper to runtime-state mirror and workflow state writers.
  - P03-4: concentrate closeout timestamp writes through helper usage so same closeout write does not diverge.
- Exact execution targets:
  - `.claude/scripts/lib/clock.mjs`
  - `.claude/scripts/lib/clock.test.mjs`
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/runtime-state.mjs`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`
  - `node .claude/scripts/lib/clock.test.mjs`
  - `node .claude/scripts/verify-phase-closeout.test.mjs`
  - `node .claude/scripts/phase-closeout-reconciler.test.mjs`
  - `node .claude/scripts/prepare-implementation-plan-state.test.mjs`
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not redesign existing timestamp formats.
- Do not rewrite historical artifacts.
- Do not redesign the SQLite runtime-state store.

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
- Files/modules: `.claude/scripts/lib/clock.mjs`, `.claude/scripts/lib/clock.test.mjs`, `.claude/scripts/phase-run-lease.mjs`, `.claude/scripts/runtime-state.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/agent-loop-phase-artifacts.mjs`
- Interfaces/contracts: `nowIso(clock?)`, completed/superseded lease field migration, shared closeout timestamp provider usage

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: For SCN-03-1 and SCN-03-2, mutate fixtures/writers through phase closeout tests, persist state/artifact outputs, recover through verifier assertions, and record fresh command evidence in QA_REPORT.md.
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
| Completed status lease migration | Test | `node .claude/scripts/verify-phase-closeout.test.mjs` passes stale-active-lease and valid-completed fixtures |
| Shared timestamp provider | Test | `node .claude/scripts/lib/clock.test.mjs` passes injected clock coverage |
| Runtime/artifact timestamp guard | Test | `node .claude/scripts/verify-phase-closeout.test.mjs` passes future timestamp fixture expectations |
| Phase regression suite | Test | `node .claude/scripts/phase-closeout-reconciler.test.mjs` and `node .claude/scripts/prepare-implementation-plan-state.test.mjs` pass |

## Evaluator Focus
- Core flow: completed closeout moves live lease data into audit fields and uses the shared timestamp provider across status, runtime mirror, workflow state, and artifacts.
- Edge cases: in-progress active lease state must not be falsely flagged as stale completed state; injected future timestamps must hard-fail deterministic verifier fixtures.
- Stub-only behavior to reject: clock helper without writer adoption, writer updates without verifier evidence, or smoke-only critical scenario evidence.

## Evidence
### Required Verification Commands
- clockHelper: `node .claude/scripts/lib/clock.test.mjs`
- phaseCloseoutUnit: `node .claude/scripts/verify-phase-closeout.test.mjs`
- reconcilerRegression: `node .claude/scripts/phase-closeout-reconciler.test.mjs`
- implementationPlanStateRegression: `node .claude/scripts/prepare-implementation-plan-state.test.mjs`
- planConformance: `node .claude/scripts/verify-plan-conformance.mjs --phase-doc docs/implementation/harness-closeout-consistency-2026-05-08/03-lease-timestamp-writer-contract-v1.md --sprint-contract docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/SPRINT_CONTRACT.md --qa-report docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/QA_REPORT.md --scorecard docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/SCORECARD.md`

### Runtime Flow
- Runtime evidence depth: open -> act -> mutate -> persist -> recover required for SCN-03-1 and SCN-03-2
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/03-phase-03-lease-and-timestamp-writer-contract-v1/WORKSETS.yaml

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
- Generated at: 2026-05-08 12:38:38
