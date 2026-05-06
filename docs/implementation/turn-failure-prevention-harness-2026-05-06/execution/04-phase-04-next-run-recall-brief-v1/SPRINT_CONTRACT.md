# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Next Run Recall Brief (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/04-next-run-recall-brief-v1.md

## Goal
- Implement the phase 04 next-run recall brief engine and runner injection path for the active atomic task only.

## Success Criteria
- The selected atomic task is implemented or explicitly blocked with evidence.
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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/04-next-run-recall-brief-v1.md
- Goal:
  - Next phase run 시작 전 최근 failed turn cases를 read-only로 조회하고, 현재 phase/stage/artifact/failure type과 겹치는 case만 `Failure Prevention Brief`로 주입한다.
- Expected outcome:
  - MemoryGraph unavailable이어도 cache-based recall이 동작하고, unrelated case는 prompt에 들어가지 않으며, brief는 최대 5개의 1문장 bullet만 포함한다.
- Scope:
  - failed turn case loader/matcher/brief formatter, phase runner prompt build 전 read-only preflight, `Failure Prevention Brief` prompt section 추가, low-confidence/imported-only handling.
- Detailed tasks:
  - P04-1 case recall matcher 구현.
  - P04-2 brief formatter 구현.
  - P04-3 runner prompt injection.
  - P04-4 skill docs sync.
- Exact execution targets:
  - `.claude/scripts/lib/awtl-failure-prevention-brief.mjs`
  - `.claude/scripts/lib/awtl-failure-prevention-brief.test.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/skills/moonshot-phase-runner/SKILL.md`
  - `.claude/skills/moonshot-phase-runner/SKILL.ko.md`
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
  - `.claude/scripts/lib/awtl-failure-prevention-brief.mjs`
  - `.claude/scripts/lib/awtl-failure-prevention-brief.test.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/skills/moonshot-phase-runner/SKILL.md`
  - `.claude/skills/moonshot-phase-runner/SKILL.ko.md`
- Interfaces/contracts:
  - case loader/matcher contract for read-only phase/stage/artifact/failure-type recall
  - brief formatter contract capped at five 1-sentence bullets with confidence labels
  - runner prompt contract for `Failure Prevention Brief` injection before prompt assembly

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: run the phase 04 unit test, runner syntax check, knowledge audit, workflow verification, and plan conformance check before any clean-finish claim.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: active atomic task is AT-01 and the run is still in ready/isolate.

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
| recall tests | Test | `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs` passes |
| runner syntax | Test | `node --check .claude/scripts/agent-loop-phase-runner.mjs` passes |
| audit | Docs/Policy | `bash .claude/scripts/knowledge-repo-audit.sh` passes |
| workflow verify | Docs/Policy | `bash .claude/scripts/workflow-enforcement.sh verify` passes |

## Evaluator Focus
- Core flow: matching case selection, compact brief formatting, prompt injection with minimal no-op behavior when recall is unavailable.
- Edge cases: unrelated cases filtered out, cache missing becomes no-op, brief capped at five bullets.
- Stub-only behavior to reject: raw JSON prompt injection, over-five bullet briefs, unrelated case leakage.

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
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/04-phase-04-next-run-recall-brief-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/04-phase-04-next-run-recall-brief-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/04-phase-04-next-run-recall-brief-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/04-phase-04-next-run-recall-brief-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 13:52:07
