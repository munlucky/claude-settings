# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Completion Gate Reason Taxonomy And Retry Policy (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/05-completion-gate-reason-taxonomy-retry-policy-v1.md

## Goal
- Make completion-gate failure reasons decision-complete so the runner chooses writer-only remediation, verification remediation, stop-loop, or limited retry without guesswork.

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/05-completion-gate-reason-taxonomy-retry-policy-v1.md
- Goal:
  - Make completion gate failure reasons decision-complete so the runner chooses writer-only remediation, verification remediation, stop-loop, or controlled fallback without guesswork.
- Expected outcome:
  - Gate reasons are normalized to a small taxonomy: `verification_missing`, `review_closeout_missing`, `finish_closeout_missing`, `environment_blocked`, `artifact_contract_invalid`, `score_incomplete`, and `ok`.
  - Review/finish closeout-only gaps do not launch broad implementation workers when fresh structured verification exists.
  - Real verification missing/failing still blocks or performs limited verification remediation.
- Scope:
  - In scope:
    - Add a gate reason normalization layer with explicit retry policy.
    - Map existing raw reasons to normalized categories without losing detail.
    - Route `review_closeout_missing` and `finish_closeout_missing` to Phase 04 writer-only remediation when fresh passed verdict exists.
    - Stop immediately for no-retry environment blockers.
    - Cap verification remediation attempts for missing verification evidence.
  - Out of scope:
    - Lowering target score.
    - Marking phases complete with stale or failed verification evidence.
    - Removing markdown checks before structured replacements exist.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P05-1 | Define gate reason taxonomy | Add normalized category and detail fields for existing gate outcomes | Every known gate reason maps to one category |
  | P05-2 | Define retry policy table | Map categories to writer-only, verification-remediation, stop-loop, or limited retry | Runner no longer infers policy from prose strings |
  | P05-3 | Integrate writer-only route | Use Phase 04 writer for review/finish closeout-only gaps with fresh verdict | No new implementation worker launches for closeout-only gaps |
  | P05-4 | Add regression fixtures | Cover missing verification, review gap, finish gap, environment block, real score incomplete | Tests prove correct route per category |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P05-1 | none | `.claude/scripts/agent-loop-phase-state.mjs` | self-test or new fixture | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Exit 0 with normalized categories |
  | P05-2 | none | `.claude/scripts/agent-loop-phase-attempt.mjs` | attempt decision fixture | `node .claude/scripts/agent-loop-phase-attempt.mjs classify-gate-stop-reason review-incomplete` | Stable category/stage output |
  | P05-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | runner dry fixture if added | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | Exit 0; writer-only branch retained |
  | P05-4 | none | test/self-test sections | same | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Strict closeout behavior preserved |
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
  - `.claude/scripts/agent-loop-phase-attempt.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/verify-phase-closeout.test.mjs`
- Interfaces/contracts:
  - Completion-gate outputs include normalized reason category, detail, retry policy, remediation stage, and stop reason fields.
  - Gate-stop classification command emits stable category/detail/policy fields for review, finish, verification, score, artifact, and environment outcomes.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: run the phase contract commands once each, record CLI output for category-to-policy mappings, and keep the closeout fixtures deterministic. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence where applicable.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, stale verification, or mismatched normalized category/policy outputs.
- Contract revision required: no
- Review notes: taxonomy helper added to the phase-state evaluator; attempt and runner paths now depend on normalized gate categories instead of prose-string branching.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 05, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-worker-overhead-reduction-2026-05-07 --master-plan docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 05:14:48
