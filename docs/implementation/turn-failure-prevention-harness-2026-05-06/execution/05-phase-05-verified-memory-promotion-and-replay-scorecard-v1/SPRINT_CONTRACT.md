# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Verified Memory Promotion And Replay Scorecard (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/05-verified-memory-promotion-replay-scorecard-v1.md

## Goal
- Convert verified-only MemoryGraph promotion into an explicit direct-write/skip path and persist replay scorecard decisions for recall filtering.

## Success Criteria
- Denial codes are machine-readable and cover blocked/unavailable replay cases.
- Default promotion flow does not write to MemoryGraph.
- Explicit verified-only promotion attempts direct write only for promotable candidates.
- Replay scorecard records promotion/skip decisions and can be read back for recall filtering.
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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/05-verified-memory-promotion-replay-scorecard-v1.md
- Goal:
  - Replay/approval-passed candidates may be promoted to MemoryGraph.
  - Replay/promotion results must be accumulated in a replay scorecard.
  - Raw trace must not be written directly to MemoryGraph.
  - MemoryGraph transport failure must not block workflow closeout.
- Expected outcome:
  - `awtl-memory-promotion.mjs --write-memorygraph --auto-promote verified-only` only writes promotable candidates.
  - Imported-only, transcript-only, raw-trace, environment/flaky/harness failure are denied.
  - MemoryGraph unavailable is recorded as `memorygraph_unavailable` skip/denial.
- Scope:
  - Add candidate provenance and validation metadata.
  - Add machine-readable denial code mapping.
  - Add direct write CLI path and unavailable handling.
  - Add replay scorecard append/read helper and recall exclusion hook.
- Detailed tasks:
  - P05-1 denial codes added and tested.
  - P05-2 compact fact provenance expanded and raw-free assertion added.
  - P05-3 direct write CLI added and syntax checked.
  - P05-4 replay scorecard helper added and filter tests pass.
- Exact execution targets:
  - `.claude/scripts/lib/awtl-memory-promotion.mjs`
  - `.claude/scripts/lib/awtl-memory-promotion.test.mjs`
  - `.claude/scripts/awtl-memory-promotion.mjs`
  - `.claude/scripts/lib/awtl-replay-scorecard.mjs`
  - `.claude/scripts/lib/awtl-replay-scorecard.test.mjs`
  - `.claude/scripts/lib/awtl-failure-prevention-brief.mjs`
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
  - .claude/scripts/lib/awtl-memory-promotion.mjs
  - .claude/scripts/lib/awtl-memory-promotion.test.mjs
  - .claude/scripts/awtl-memory-promotion.mjs
  - .claude/scripts/lib/awtl-replay-scorecard.mjs
  - .claude/scripts/lib/awtl-replay-scorecard.test.mjs
  - .claude/scripts/lib/awtl-failure-prevention-brief.mjs
  - .claude/schemas/awtl-memory-candidate-v1.schema.json
- Interfaces/contracts:
  - Stable denial code mapping for blocked and unavailable promotion paths
  - Candidate provenance fields for replay/approval-derived compact facts
  - Replay scorecard append/read contract with stale/risky recall exclusion

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: record blocked/skip evidence for unavailable MemoryGraph, verify no-write default, then prove verified-only direct write and replay scorecard readback.
- Round fail conditions: missing contract review, missing runtime evidence, smoke-only evidence, repeated failure class without retry strategy, stale verification, or unapproved deviation.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 05, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|-----------------|
| denial codes | API/Test | blocked cases emit stable machine-readable codes |
| default no-write | API/Test | default flow does not write to MemoryGraph |
| verified-only write | API/Test | explicit verified-only path attempts direct write only for promotable candidates |
| scorecard recall | API/Test | replay scorecard append/read affects recall filtering |

## Evaluator Focus
- Core flow: verify-only promotion, direct write attempt, replay scorecard append/read, and recall exclusion.
- Edge cases: imported-only, transcript-only, raw-trace, flaky, environment failure, and MemoryGraph unavailable.
- Stub-only behavior to reject: fake pass on unavailable MemoryGraph, default write behavior, and raw-trace direct storage.

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
- Runtime evidence depth: blocked/unavailable evidence expected until verification completes
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/05-phase-05-verified-memory-promotion-and-replay-scorecard-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/05-phase-05-verified-memory-promotion-and-replay-scorecard-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/05-phase-05-verified-memory-promotion-and-replay-scorecard-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/05-phase-05-verified-memory-promotion-and-replay-scorecard-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 14:09:50
