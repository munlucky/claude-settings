# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Fallback Closeout Reconciler (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/02-fallback-closeout-reconciler-v1.md

## Goal
- Add a Phase 02 fallback closeout reconciler so a successful local fallback closeout supersedes failed delegated-terminal workflow state and records the local fallback completion consistently.

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
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/02-fallback-closeout-reconciler-v1.md
- Goal:
  - Add `.claude/scripts/phase-closeout-reconciler.mjs`.
  - After fallback closeout, reconcile `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` so failed delegated-terminal state is closed as `superseded-by-local-fallback`.
  - Record fallback completion as `completed-via-local-fallback`.
- Expected outcome:
  - `phase-status.yaml` and workflow-enforcement state do not disagree after fallback completion.
  - Missing state files are warnings only; existing drift is closed.
- Scope:
  - Include CLI args `--status-file`, `--workflow-dir`, `--fallback-run-id`, `--reason`, and `--now`.
  - Include JSON atomic write helper, reconciliation for `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json`, plus agent-loop debug/log fallback closeout summary event.
  - Exclude generic YAML parser introduction, runtime-state SQLite migration, and bulk rewrite of all historical dispatch files.
- Detailed tasks:
  - P02-1: implement reconciler CLI with args parsing, JSON read/write, missing file warnings, and deterministic summary JSON output.
  - P02-2: supersede failed delegated run state with `status: superseded-by-local-fallback`, `fallbackRunId`, `supersededRunLeaseId`, `supersededAt`, and `completionBoundary`.
  - P02-3: mirror fallback completion with `completionStatus: completed-via-local-fallback` while preserving reason.
  - P02-4: connect dispatch local fallback closeout to the reconciler and record a debug summary event.
- Exact execution targets:
  - Create `.claude/scripts/phase-closeout-reconciler.mjs`.
  - Create `.claude/scripts/phase-closeout-reconciler.test.mjs`.
  - Modify `.claude/scripts/moonshot-phase-dispatch.mjs`.
  - Verify with `node .claude/scripts/phase-closeout-reconciler.test.mjs`.
  - Verify with `node .claude/scripts/verify-phase-closeout.test.mjs`.
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not introduce a generic YAML parser.
- Do not migrate runtime-state SQLite.
- Do not bulk rewrite historical dispatch files.

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
- Files/modules:
  - `.claude/scripts/phase-closeout-reconciler.mjs`
  - `.claude/scripts/phase-closeout-reconciler.test.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
- Interfaces/contracts:
  - Reconciler CLI: `--status-file`, `--workflow-dir`, `--fallback-run-id`, `--reason`, `--now`
  - Reconciled workflow files: `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`
  - Status markers: `superseded-by-local-fallback`, `completed-via-local-fallback`

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Use temp fixture tests to open existing failed delegated state, act by running the reconciler/dispatch hook, mutate persisted workflow files, persist status markers, and recover by re-reading files plus asserting summary event output.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Contract refreshed before code edits from the active Phase 02 source doc. Source requirements remain binding; no spec deviation is approved.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 02, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Phase 02 reconciler fixture | Test | `node .claude/scripts/phase-closeout-reconciler.test.mjs` passes and asserts supersede, fallback mirror, warnings, and summary event behavior |
| Phase closeout regression | Test | `node .claude/scripts/verify-phase-closeout.test.mjs` passes |
| Plan conformance | Test | `.claude/scripts/verify-plan-conformance.mjs` passes for active phase artifacts |

## Evaluator Focus
- Core flow: successful local fallback closeout supersedes failed delegated-terminal state across the three workflow files and records a consistent fallback completion marker.
- Edge cases: missing workflow state files warn without creation; existing failed delegated drift is closed deterministically; reason and run identifiers are preserved.
- Stub-only behavior to reject: summary-only output without persisted file mutation, test-only implementation without dispatch integration, or smoke-only evidence for SCN-02-1.

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
- Runtime evidence depth: planned open -> act -> mutate -> persist -> recover via temp fixture and persisted JSON re-read assertions
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/02-phase-02-fallback-closeout-reconciler-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/02-phase-02-fallback-closeout-reconciler-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/02-phase-02-fallback-closeout-reconciler-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/02-phase-02-fallback-closeout-reconciler-v1/WORKSETS.yaml

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
- Generated at: 2026-05-08 12:29:28
