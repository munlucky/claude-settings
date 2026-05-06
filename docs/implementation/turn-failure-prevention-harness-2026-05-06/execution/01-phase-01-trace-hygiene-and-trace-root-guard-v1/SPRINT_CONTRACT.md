# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Trace Hygiene And Trace Root Guard (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/01-trace-hygiene-trace-root-guard-v1.md

## Goal
- Hardening phase 01 trace hygiene by blocking forbidden trace artifacts, rejecting nested trace roots, and removing tracked nested trace leftovers within the active phase scope.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.
- `AT-01` is the only active atomic task in this attempt.

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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/01-trace-hygiene-trace-root-guard-v1.md
- Goal:
  - Not found in source phase doc.
- Expected outcome:
  - Not found in source phase doc.
- Scope:
  - Not found in source phase doc.
- Detailed tasks:
  - Not found in source phase doc.
- Exact execution targets:
  - P01-1 | none | `.claude/scripts/verify-code-policy.mjs` | none | `node .claude/scripts/verify-code-policy.mjs .claude/.claude/traces/self-test-1778036826516/agent_work_trace.jsonl` | forbidden trace path violation으로 exit 1
  - P01-2 | none | `.gitignore` | none | `git status --short --ignored .claude/.claude/traces .claude/traces` | trace runtime files는 ignored 또는 tracked removal로만 표시
  - P01-3 | none | `.claude/scripts/lib/awtl-trace-sink.mjs` | `.claude/scripts/lib/awtl-trace-sink.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` | nested root reject test 포함 pass
  - P01-4 | none | tracked trace artifact removal | none | `git ls-files .claude/.claude/traces .claude/traces` | output empty
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
  - `.gitignore`
  - `.claude/scripts/verify-code-policy.mjs`
  - `.claude/scripts/lib/awtl-trace-sink.mjs`
  - `.claude/scripts/lib/awtl-trace-sink.test.mjs`
  - `.claude/.claude/traces/**` tracked artifact removal if present
- Interfaces/contracts:
  - Forbidden trace path checks must fail source-policy verification for tracked or candidate trace artifacts.
  - Trace root resolution must reject nested `.claude/.claude/traces` roots and repo-external roots.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: verify forbidden trace policy failure, nested trace root reject, tracked artifact absence, and policy smoke signals. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
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
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/01-phase-01-trace-hygiene-and-trace-root-guard-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/01-phase-01-trace-hygiene-and-trace-root-guard-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/01-phase-01-trace-hygiene-and-trace-root-guard-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/01-phase-01-trace-hygiene-and-trace-root-guard-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 13:04:41
