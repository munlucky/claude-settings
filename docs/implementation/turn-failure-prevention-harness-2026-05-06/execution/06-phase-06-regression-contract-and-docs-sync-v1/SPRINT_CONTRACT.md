# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Regression Contract And Docs Sync (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/06-regression-contract-docs-sync-v1.md

## Goal
- Sync the turn-failure prevention harness contracts after Phase 01-05 so docs, skills, verification contract, and closeout evidence describe the implemented behavior.

## Success Criteria
- AWTL, MemoryGraph, failure-analyzer, harness-memory-promoter, and verification contract docs match the implemented turn-failure loop.
- Full AWTL regression and policy checks have fresh evidence, with any environment-only skip recorded explicitly.
- Phase status, QA report, scorecard, and handoff agree before clean finish.

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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/06-regression-contract-docs-sync-v1.md
- Goal:
  - Not found in source phase doc.
- Expected outcome:
  - Not found in source phase doc.
- Scope:
  - Not found in source phase doc.
- Detailed tasks:
  - Not found in source phase doc.
- Exact execution targets:
  - P06-1 | none | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md`, `.claude/docs/guidelines/memorygraph-workflow.md`, `.claude/docs/guidelines/memorygraph-workflow.ko.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass
  - P06-2 | none | `.claude/skills/failure-analyzer/SKILL.md`, `.claude/skills/failure-analyzer/SKILL.ko.md`, `.claude/skills/harness-memory-promoter/SKILL.md`, `.claude/skills/harness-memory-promoter/SKILL.ko.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass
  - P06-3 | none | `.claude/verification.contract.yaml` | closeout verifier | `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/turn-failure-prevention-harness-2026-05-06 --master-plan docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md` | closeout contract pass after phase evidence
  - P06-4 | none | phase evidence docs | all changed tests | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs .claude/scripts/lib/awtl-runtime-importers.test.mjs` | all targeted tests pass
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Add new runtime features beyond documentation and contract synchronization.
- Sync downstream projects.
- Stage or persist runtime cache, trace, or MemoryGraph data.

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
  - `.claude/docs/guidelines/awtl-rsme.md`
  - `.claude/docs/guidelines/awtl-rsme.ko.md`
  - `.claude/docs/guidelines/memorygraph-workflow.md`
  - `.claude/docs/guidelines/memorygraph-workflow.ko.md`
  - `.claude/skills/failure-analyzer/SKILL.md`
  - `.claude/skills/failure-analyzer/SKILL.ko.md`
  - `.claude/skills/harness-memory-promoter/SKILL.md`
  - `.claude/skills/harness-memory-promoter/SKILL.ko.md`
  - `.claude/verification.contract.yaml`
  - `docs/implementation/turn-failure-prevention-harness-2026-05-06/**`
- Interfaces/contracts:
  - failed turn case provenance and `failure_turn_id`
  - failure prevention brief matching and stale/risky scorecard exclusion
  - verified-only MemoryGraph write policy and unavailable semantics
  - regression commands for AWTL turn-failure prevention

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Docs-only contract sync plus automated AWTL regression, policy, audit, boundary, parity, plan conformance, and closeout checks.
- Round fail conditions: Missing fresh verification evidence, source plan conformance failure, stale active runtime blocker, or MemoryGraph write success claimed when unavailable.
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
| AWTL regression | Test | trace root guard, turn capture, failure attribution, memory promotion, and importers pass |
| AWTL prevention regression | Test | failed turn case, prevention brief, and replay scorecard tests pass |
| Policy and audit | Static/Test | knowledge audit and code policy pass |
| Workflow boundary | Static/Test | workflow enforcement, phase runner boundary, and runtime parity pass or record explicit environment-only skip |
| Closeout | Contract | plan conformance, phase closeout, scorecard, and QA report agree |

## Evaluator Focus
- Core flow: failed turn -> failed_turn_case -> next-run brief -> replay scorecard -> verified-only promotion policy.
- Edge cases: nested trace path, retry starts new turn id, imported-only/transcript-only candidates, unavailable MemoryGraph, stale/risky scorecard entries.
- Stub-only behavior to reject: source-only completion, undocumented skip, MemoryGraph write success without actual write evidence, or prevention hints derived from raw transcript text.

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
- awtlRegression: `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs .claude/scripts/lib/awtl-runtime-importers.test.mjs`
- awtlFailurePreventionRegression: `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs .claude/scripts/lib/awtl-replay-scorecard.test.mjs`
- awtlCliSyntax: `node --check .claude/scripts/agent-loop-phase-runner.mjs && node --check .claude/scripts/agent-loop-phase-plan-lib.mjs && node --check .claude/scripts/awtl-failure-analyzer.mjs && node --check .claude/scripts/awtl-memory-promotion.mjs`
- memoryGraphHealth: `node .claude/scripts/memorygraph-direct.mjs health`

### Runtime Flow
- Runtime evidence depth: automated contract and harness regression evidence; no browser/UI flow applies.
- Critical SCN-* minimum: trace root guard -> turn capture -> failed case -> recall filtering -> replay/promotion decision -> closeout.
- MemoryGraph unavailable semantics: health is recorded separately; unavailable write blocks only strict memory validation or explicit promotion write success.

### Artifacts
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/06-phase-06-regression-contract-and-docs-sync-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/06-phase-06-regression-contract-and-docs-sync-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/06-phase-06-regression-contract-and-docs-sync-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/06-phase-06-regression-contract-and-docs-sync-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: full `workflow-enforcement.sh verify` may flag older seeded phase artifacts; if so, update owned closeout evidence instead of weakening the verifier.
- Rollback or safe fallback: revert only Phase 06 docs/contract edits; keep Phase 01-05 implementation unchanged unless their regression tests fail.

## Notes
- Generated at: 2026-05-06 14:27:37
