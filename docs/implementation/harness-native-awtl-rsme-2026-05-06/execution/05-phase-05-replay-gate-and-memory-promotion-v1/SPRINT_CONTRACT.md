# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Replay Gate and Memory Promotion (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/05-replay-gate-memory-promotion-v1.md

## Goal
- Implement the phase-05 replay gate, compact promotion fact writer, and memory-promotion CLI/test coverage for approval- or replay-gated MemoryGraph promotion.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/05-replay-gate-memory-promotion-v1.md
- Goal:
  - replay or human approval is required before MemoryGraph promotion, and promotion provenance/scope must be machine-checkable.
- Expected outcome:
  - `memory_update_candidates.jsonl` promotes only compact facts with provenance.
  - raw AWTL trace, transcript-only imported events, and environment/flaky failures are blocked from MemoryGraph promotion.
- Scope:
  - Included: easy/hard/regression replay probe manifest shape, candidate promotion gate, compact fact conversion with provenance tags, human approval evidence path support, MemoryGraph unavailable non-blocking behavior.
  - Excluded: automatic approval, raw trace storage in MemoryGraph, transcript-only candidate promotion.
- Detailed tasks:
  - P05-1 Replay probe manifest implementation.
  - P05-2 Promotion gate implementation.
  - P05-3 Compact fact/provenance writer implementation.
  - P05-4 MemoryGraph boundary regression.
- Exact execution targets:
  - P05-1 -> `.claude/scripts/lib/awtl-replay-probes.mjs`; test `.claude/scripts/lib/awtl-memory-promotion.test.mjs`; command `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`.
  - P05-2 -> `.claude/scripts/lib/awtl-memory-promotion.mjs`; test `.claude/scripts/lib/awtl-memory-promotion.test.mjs`; command `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`.
  - P05-3 -> `.claude/scripts/awtl-memory-promotion.mjs`; updated `.claude/skills/harness-memory-promoter/SKILL.md` and `.claude/agents/harness-memory-promoter.md`; command `node --check .claude/scripts/awtl-memory-promotion.mjs`.
  - P05-4 -> updated `.claude/docs/guidelines/memorygraph-workflow.md` and `.claude/docs/guidelines/awtl-rsme.md`; command `bash .claude/scripts/knowledge-repo-audit.sh`.
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or removing any item requires user-approved replan before this phase can close.

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
  - `.claude/scripts/lib/awtl-replay-probes.mjs`
  - `.claude/scripts/lib/awtl-memory-promotion.mjs`
  - `.claude/scripts/awtl-memory-promotion.mjs`
  - `.claude/scripts/lib/awtl-memory-promotion.test.mjs`
  - `.claude/agents/harness-memory-promoter.md`
  - `.claude/agents/harness-memory-promoter.ko.md`
  - `.claude/skills/harness-memory-promoter/SKILL.md`
  - `.claude/skills/harness-memory-promoter/SKILL.ko.md`
  - `.claude/docs/guidelines/memorygraph-workflow.md`
  - `.claude/docs/guidelines/memorygraph-workflow.ko.md`
  - `.claude/docs/guidelines/awtl-rsme.md`
  - `.claude/docs/guidelines/awtl-rsme.ko.md`
- Interfaces/contracts:
  - replay probe manifests must expose easy/hard/regression probe status and regression worsening detection
  - promotion gate must require replay evidence or human approval, preserve imported-only/environment/flaky/harness blockers, and emit compact provenance tags without raw trace bodies
  - CLI must normalize candidate promotion output and keep MemoryGraph-unavailable behavior non-blocking for unrelated workflow

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Phase-05 unit tests cover replay-worsening, approval gating, provenance tags, and MemoryGraph-unavailable behavior; the final attempt also validated plan conformance, workflow enforcement, runtime parity, runner boundary, worktree self-test, and phase closeout.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Active attempt is limited to phase 05 and will not expand to later importer-regression work.

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
|-------|------|----------------|
| Memory-promotion gate and provenance | Test | Approval or replay evidence required; compact facts include provenance tags and omit raw trace |
| MemoryGraph boundary behavior | Test | Imported-only, flaky/environment, and unavailable MemoryGraph paths remain blocked or non-blocking as specified |

## Evaluator Focus
- Core flow: replay-gated or approval-gated memory promotion to compact provenance facts
- Edge cases: regression worsening, imported-only, flaky/environment, and unavailable MemoryGraph conditions
- Stub-only behavior to reject: raw trace promotion, missing provenance, or promotion without replay/approval evidence

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-native-awtl-rsme-2026-05-06 --master-plan docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: phase-05 unit tests, syntax, workflow checks, runtime parity, and closeout all passed
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Verified in the final attempt.

### Artifacts
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-phase-05-replay-gate-and-memory-promotion-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-phase-05-replay-gate-and-memory-promotion-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-phase-05-replay-gate-and-memory-promotion-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/05-phase-05-replay-gate-and-memory-promotion-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally postponed verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally postponed verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: 2026-05-06 04:54:07
