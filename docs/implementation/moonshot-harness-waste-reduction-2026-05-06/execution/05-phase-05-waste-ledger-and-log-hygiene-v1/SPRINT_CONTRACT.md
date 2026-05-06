# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Waste Ledger and Log Hygiene (v1)
- Source plan: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/05-waste-ledger-log-hygiene-v1.md

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
- Source phase doc: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/05-waste-ledger-log-hygiene-v1.md
- Goal:
  - Make abnormal retry cost visible while reducing phase log noise.
- Expected outcome:
  - Runs produce `waste-ledger.jsonl` and `noise-summary.json`; repeated plugin/skill/deprecation warnings no longer inflate phase logs.
- Scope:
  - In scope:
    - Add waste ledger append helper.
    - Add noise summary for repeated warnings.
    - Replace deprecated `codex exec --full-auto` with supported sandbox flags.
    - Record MemoryGraph transport failure once per run.
  - Out of scope:
    - Deleting historical logs.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P05-1 | Add waste ledger helper | Append abnormal retry events with phase, class, action, evidence path | Every non-healthy retry class has one ledger row |
  | P05-2 | Add warning filter | Summarize plugin manifest, skill icon, deprecation, MemoryGraph transport warnings | Phase logs keep first occurrence and summary counts |
  | P05-3 | Replace deprecated Codex flag | Update command builders in dispatch/runtime CLI | No `--full-auto` warning appears in new run logs |
  | P05-4 | Summary integration | Add waste counts to agent loop summary | Summary lists healthy retries vs waste retries |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P05-1 | `.claude/logs/agent-loop/waste-ledger.jsonl` at runtime | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop.mjs`, `.claude/scripts/moonshot-phase-dispatch.mjs` | boundary verifier | `bash .claude/scripts/verify-phase-runner-boundary.sh` | GREEN: ledger rows emitted |
  | P05-2 | `.claude/logs/agent-loop/noise-summary.json` at runtime | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/runtime-cli.mjs` | static search and boundary verifier | `rg -- "--full-auto" .claude/scripts` | GREEN: no deprecated active command path |
  | P05-3 | none | `.claude/verification.contract.yaml` | contract checks | `bash .claude/scripts/workflow-enforcement.sh verify` | GREEN: observability artifacts accepted |
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
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/runtime-cli.mjs`
  - `.claude/scripts/lib/failure-classifier.mjs`
  - `.claude/scripts/lib/waste-ledger.mjs` if a shared helper is needed for JSONL writes
- Interfaces/contracts:
  - Waste ledger rows capture `phase`, `class`, `action`, `evidencePath`, and `count` for abnormal retry classes.
  - Warning hygiene keeps the first actionable occurrence in logs and rolls repeats into `noise-summary.json`.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover using phase-runner boundary, workflow enforcement, static deprecated-flag search, and the ledger/noise artifacts.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
- Codex has mapped the phase-owned scripts and will keep changes bounded to the active phase scope.

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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/05-phase-05-waste-ledger-and-log-hygiene-v1/QA_REPORT.md
- Handoff: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/05-phase-05-waste-ledger-and-log-hygiene-v1/HANDOFF.md
- Scorecard: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/05-phase-05-waste-ledger-and-log-hygiene-v1/SCORECARD.md
- Worksets: docs/implementation/moonshot-harness-waste-reduction-2026-05-06/execution/05-phase-05-waste-ledger-and-log-hygiene-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 08:55:51
