# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Spawn Prompt Redaction And Log Hygiene (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/03-spawn-prompt-redaction-log-hygiene-v1.md

## Goal
- Redact prompt-bearing spawn events and archive prompt text by stable hash so logs stay bounded without losing recovery evidence.

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/03-spawn-prompt-redaction-log-hygiene-v1.md
- Goal:
  - Separate operational trace from full prompt archive so logs stay searchable and bounded.
- Expected outcome:
  - `SUPERVISOR_EVENT spawn` no longer includes the full prompt argument.
  - Spawn events include command name, redacted argv summary, prompt hash, prompt byte count, and prompt archive path.
  - Prompt archives are stored once per hash under `.claude/logs/agent-loop/prompts/`.
- Scope:
  - In scope:
    - Add helper to detect prompt-bearing argv and archive prompt text by stable hash.
    - Redact `SUPERVISOR_EVENT spawn` payloads in both watchdog and completion-gate runners.
    - Keep enough command metadata to debug runtime selection and command construction.
    - Preserve full prompt in ignored log prompt archive, not in phase log lines.
  - Out of scope:
    - Changing the content of worker prompts.
    - Removing raw stdout/stderr from worker execution logs.
    - Changing AWTL event schema unless existing event tests require explicit metadata additions.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P03-1 | Add command redaction helper | Implement command summary with `commandName`, `argvHash`, `promptHash`, `promptBytes`, `promptArchivePath` | Spawn event omits raw prompt |
  | P03-2 | Archive prompt once per hash | Write prompt files under `.claude/logs/agent-loop/prompts/` and reuse existing file for same hash | Repeated same prompt does not duplicate archive |
  | P03-3 | Apply to runtime spawn events | Use helper in `run-with-watchdog` and `run-worker-prompt-with-completion-gate` | Both event modes are redacted |
  | P03-4 | Preserve debuggability | Include runtime command name and non-prompt args needed for troubleshooting | Operator can see runtime and cwd without reading prompt |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P03-1 | optional helper test fixture | `.claude/scripts/agent-loop-phase-runtime.mjs` | runtime fixture/self-test if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
  | P03-2 | `.claude/logs/agent-loop/prompts/<hash>.txt` at runtime only | `.claude/scripts/agent-loop-phase-runtime.mjs` | temp prompt fixture | targeted fixture command | Archive file exists; event stores path/hash |
  | P03-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | same | fixture covering both modes | Both spawn modes redacted |
  | P03-4 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` if dispatch launch logging needs matching summary | existing checks | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |
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
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
- Interfaces/contracts:
  - `SUPERVISOR_EVENT spawn` payloads omit raw prompt text and include command name, redacted argv summary, prompt hash, prompt byte count, and prompt archive path.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: verify the redacted spawn event shape, archive path reuse, and debug metadata with a targeted runtime fixture after implementation.
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
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 04:58:09
