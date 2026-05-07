# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Runtime Unavailable Cache And MemoryGraph Policy (v1)
- Source plan: docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/06-runtime-unavailable-cache-memorygraph-policy-v1.md

## Goal
- Cache run-level unavailable capability findings so repeated phase attempts summarize known unavailable paths instead of re-probing and re-logging them.

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
- Source phase doc: docs/implementation/harness-worker-overhead-reduction-2026-05-07/06-runtime-unavailable-cache-memorygraph-policy-v1.md
- Goal:
  - Cache runtime unavailable capability findings at the run level so repeated attempts do not re-probe or re-log the same unavailable path.
- Expected outcome:
  - MemoryGraph MCP unavailable, plugin network sync unavailable, PATH mutation denied, and MCP cleanup EPERM are recorded once per run as unavailable capabilities.
  - Later closeout/remediation attempts read the cached state and emit a short summary instead of repeating full probes or warnings.
  - MemoryGraph unavailable remains non-blocking unless a strict memory gate is explicitly enabled.
- Scope:
  - In scope:
    - Add run-level `unavailableCapabilities` representation to lease/status runtime metadata or a dedicated runtime state artifact.
    - Cache classified unavailable findings by code, fingerprint, firstSeenAt, source, evidencePath, and strictness.
    - Add read path that suppresses repeated probe attempts for already-known unavailable capabilities in the same run.
    - Preserve strict memory validation if a future strict memory gate explicitly asks for it.
  - Out of scope:
    - Making MemoryGraph writes mandatory.
    - Changing MemoryGraph data model.
    - Suppressing first occurrence evidence.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P06-1 | Define unavailable cache shape | Add run-scoped fields for code, fingerprint, source, firstSeenAt, lastSeenAt, evidencePath, strict | Cache can be read without parsing long logs |
  | P06-2 | Record first occurrence | Write cache entry when classifier/preflight sees MemoryGraph, plugin network, PATH update, or MCP cleanup unavailable | First occurrence keeps evidence path |
  | P06-3 | Suppress repeated probes/logs | Before repeated recall/probe/startup handling, check cache and emit summary | Same code does not repeat full warning in later attempts |
  | P06-4 | Preserve strict mode | Allow strict memory gate to override non-blocking unavailable policy | Strict mode can still block explicitly |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |---|---|---|---|---|---|
  | P06-1 | optional temp fixture only | `.claude/scripts/phase-run-lease.mjs` | self-test if present or new fixture | `node --check .claude/scripts/phase-run-lease.mjs` | Exit 0 |
  | P06-2 | none | `.claude/scripts/phase-capability-preflight.mjs`, `.claude/scripts/agent-loop-phase-runtime.mjs` | cache fixture | `node --check .claude/scripts/phase-capability-preflight.mjs && node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
  | P06-3 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | dispatch fixture if added | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |
  | P06-4 | none | `.claude/scripts/commit-moonshot-memory-refresh.mjs` if needed | memory refresh smoke | `node --check .claude/scripts/commit-moonshot-memory-refresh.mjs` | Exit 0 |
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
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/commit-moonshot-memory-refresh.mjs`
- Interfaces/contracts:
  - Add run-scoped unavailable capability state with code, fingerprint, source, firstSeenAt, lastSeenAt, evidencePath, and strictness.
  - Suppress repeated probe/startup warnings when a known unavailable capability is already cached in the current run.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 06, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- QA report: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/SCORECARD.md
- Worksets: docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/harness-worker-overhead-reduction-v1/06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 05:29:02
