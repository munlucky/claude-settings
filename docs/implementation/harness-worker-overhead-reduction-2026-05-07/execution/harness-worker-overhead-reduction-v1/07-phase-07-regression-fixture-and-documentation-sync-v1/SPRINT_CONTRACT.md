# Phase 07 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 7
- Title: Phase 07: Regression Fixture And Documentation Sync (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/07-regression-fixture-documentation-sync-v1.md

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/07-regression-fixture-documentation-sync-v1.md
- Goal:
  - Lock all overhead-reduction behavior into regression tests and documentation so future harness changes do not reintroduce the same costs.
- Expected outcome:
  - A regression suite covers verdict placeholder normalization, raw failure classification, prompt redaction, artifact writer idempotence, gate reason routing, runtime unavailable cache, and Codex CLI args.
  - Execution traceability files map every HWO requirement to evidence.
  - Knowledge repository audit passes after structural doc changes.
- Scope:
  - In scope:
    - Add or update tests that protect each phase behavior.
    - Add Codex CLI regression check for `--sandbox workspace-write` and absence of `--full-auto`.
    - Create or refresh package-level `execution/REQUIREMENTS_TRACEABILITY.md` and `execution/SCENARIO_MATRIX.md`.
    - Update relevant guideline/index docs only if they already reference harness optimization or waste reduction.
    - Run repository audit after structural documentation changes.
  - Out of scope:
    - Staging or committing changes.
    - Preparing `.claude/docs/phase-status.yaml` for execution unless the user explicitly asks.
    - Editing completed prior package artifacts.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P07-1 | Add regression matrix | Add tests or self-tests for each HWO requirement | Every source requirement has a command-backed evidence path |
  | P07-2 | Add Codex CLI guard | Assert `codex-base-args` includes `--sandbox workspace-write` and excludes `--full-auto` | CLI drift fails tests |
  | P07-3 | Refresh traceability docs | Write package `REQUIREMENTS_TRACEABILITY.md` and `SCENARIO_MATRIX.md` | Every HWO and SCN is mapped to pass/pending evidence |
  | P07-4 | Run audit and closeout checks | Run knowledge repo audit and core harness tests | Audit and tests pass or documented blockers remain |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P07-1 | `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/REQUIREMENTS_TRACEABILITY.md`, `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/SCENARIO_MATRIX.md` | relevant test files | touched tests | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Exit 0 with raw fixture coverage |
  | P07-2 | none | existing or new runtime CLI test fixture | `.claude/scripts/runtime-cli.mjs` | `node .claude/scripts/runtime-cli.mjs codex-base-args /Users/dev/claude-settings` | no `--full-auto`; has `--sandbox workspace-write` |
  | P07-3 | traceability docs | optional guideline/index doc if needed | docs audit | `.claude/scripts/knowledge-repo-audit.sh` | Exit 0 |
  | P07-4 | none | none | full closeout checks | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |
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
- Round policy summary: Keep this run isolated to phase 07, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-worker-overhead-reduction-2026-05-07 --master-plan docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/07-phase-07-regression-fixture-and-documentation-sync-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/07-phase-07-regression-fixture-and-documentation-sync-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/07-phase-07-regression-fixture-and-documentation-sync-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/07-phase-07-regression-fixture-and-documentation-sync-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 05:52:00

