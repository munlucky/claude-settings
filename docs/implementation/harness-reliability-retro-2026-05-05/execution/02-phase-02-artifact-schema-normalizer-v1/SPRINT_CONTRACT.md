# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Artifact Schema Normalizer (v1)
- Source plan: docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\02-artifact-schema-normalizer-v1.md

## Goal
- Normalize artifact schema handling so QA_REPORT, HANDOFF, SCORECARD, and SCENARIO_MATRIX share the same canonical closeout enums, blocked-state handling, Korean heading aliases, and SCN evidence parsing.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\02-artifact-schema-normalizer-v1.md
- Goal:
  - Normalize artifact schema handling so QA_REPORT, HANDOFF, SCORECARD, and SCENARIO_MATRIX share the same canonical closeout enums, blocked-state handling, Korean heading aliases, and SCN evidence parsing.
- Expected outcome:
  - blocked QA/HANDOFF is verifier-readable with canonical schema.
  - `SCN-ID | pass | evidence path` is handled identically by template and parser.
  - generator and verifier do not drift on allowed enums.
- Scope:
  - included: allowed `Next path` and `Closeout reason` enum source, blocked QA/HANDOFF normalizer or generator, Korean heading alias table, SCN evidence parser strengthening.
  - excluded: runner retry suppression policy, runtime parity fixture movement logic.
- Detailed tasks:
  - P02-1: add shared enum constants and verify they are shared by workflow/closeout/verdict parser.
  - P02-2: normalize blocked artifacts and fill required sections.
  - P02-3: add Korean heading aliases and SCN evidence parsing coverage.
- Exact execution targets:
  - `.claude/scripts/artifact-normalizer.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`
  - `.claude/scripts/verify-plan-conformance.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`
  - `.claude/scripts/artifact-normalizer.test.mjs`
  - `.claude/templates/execution/QA_REPORT.template.md`
  - `.claude/templates/execution/HANDOFF.template.md`
  - `.claude/templates/execution/SCENARIO_MATRIX.template.md`
  - Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- runner retry suppression policy
- runtime parity fixture movement logic
- any plan re-scope without a recorded user-approved replan

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
  - `.claude/scripts/artifact-normalizer.mjs`
  - `.claude/scripts/artifact-normalizer.test.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`
  - `.claude/scripts/verify-plan-conformance.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`
  - `.claude/templates/execution/QA_REPORT.template.md`
  - `.claude/templates/execution/HANDOFF.template.md`
  - `.claude/templates/execution/SCENARIO_MATRIX.template.md`
- Interfaces/contracts:
  - canonical `Next path` / `Closeout reason` enum source
  - blocked artifact normalization for legacy values
  - heading alias table for Korean phase docs
  - SCN evidence parser acceptance for `SCN-ID | pass | evidence path`

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, stale verification, or plan conformance failure.
- Contract revision required: no
- Review notes: phase 2 contract and execution targets were refreshed before implementation; blocked closeout remains due to external verifier availability and upstream traceability gaps.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 02, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: auto

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Schema normalizer self-test | Test | `node .claude/scripts/artifact-normalizer.test.mjs` passes |
| Blocked fixture smoke | Test | `node .claude/scripts/artifact-normalizer.test.mjs blocked-fixture` passes |
| Korean heading aliases | Test | `node .claude/scripts/artifact-normalizer.test.mjs korean-headings` passes |

## Evaluator Focus
- Core flow: canonicalize blocked QA/HANDOFF artifacts and accept the shared enum source in verifier paths.
- Edge cases: Korean phase headings, legacy `blocked` / `stop_and_handoff` values, and `SCN-ID | pass | evidence path` rows.
- Stub-only behavior to reject: placeholder-only artifacts, parser drift between generator and verifier, and blocked clean-finish claims without canonical evidence.

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation --master-plan docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md`
- planConformance: `node .claude/scripts/verify-plan-conformance.mjs --phase-doc docs/implementation/harness-reliability-retro-2026-05-05/02-artifact-schema-normalizer-v1.md --sprint-contract docs/implementation/harness-reliability-retro-2026-05-05/execution/02-phase-02-artifact-schema-normalizer-v1/SPRINT_CONTRACT.md`

### Runtime Flow
- Runtime evidence depth: open -> act -> mutate -> persist -> recover
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-reliability-retro-2026-05-05/execution/02-phase-02-artifact-schema-normalizer-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-reliability-retro-2026-05-05/execution/02-phase-02-artifact-schema-normalizer-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-reliability-retro-2026-05-05/execution/02-phase-02-artifact-schema-normalizer-v1/SCORECARD.md
- Worksets: docs/implementation/harness-reliability-retro-2026-05-05/execution/02-phase-02-artifact-schema-normalizer-v1/WORKSETS.yaml

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
- Generated at: 2026-05-05 09:17:07
