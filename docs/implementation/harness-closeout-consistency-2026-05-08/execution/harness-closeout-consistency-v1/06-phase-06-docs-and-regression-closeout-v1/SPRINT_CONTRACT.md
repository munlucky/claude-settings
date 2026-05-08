# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Docs and Regression Closeout (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/06-docs-regression-closeout-v1.md

## Goal
- Update the phase 06 closeout docs and regression evidence so the harness closeout contract can distinguish truth-source priority, fallback reconciler semantics, clean completion, and environment-blocked completion.

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
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/06-docs-regression-closeout-v1.md
- Goal:
  - `.claude/docs/guidelines/meta-harness-trace.md` explains truth-source priority and reconciler meaning.
  - `.claude/docs/guidelines/product-acceptance-gate.md` distinguishes clean complete from environment-blocked complete.
  - New and existing workflow regression commands produce closeout evidence.
- Expected outcome:
  - Docs explain the new runtime contract without over-expanding implementation details.
  - Regression evidence is sufficient for closeout.
- Scope:
  - Include trace source priority documentation, fallback reconciler audit semantics, clean vs environment-blocked completion documentation, and master checklist closeout evidence.
  - Exclude new operations guides, downstream project sync, and broad README rewrites.
- Detailed tasks:
  - P06-1: update meta trace documentation for source priority and supersede semantics.
  - P06-2: update product acceptance gate documentation for verdict taxonomy.
  - P06-3: run focused regression commands.
  - P06-4: record master checklist and closeout evidence.
- Exact execution targets:
  - `rg -n "superseded-by-local-fallback|completed-via-local-fallback" .claude/docs/guidelines/meta-harness-trace.md`
  - `rg -n "complete_with_environment_blocker|clean complete" .claude/docs/guidelines/product-acceptance-gate.md`
  - `node .claude/scripts/phase-closeout-reconciler.test.mjs`
  - `node .claude/scripts/verify-phase-closeout.test.mjs`
  - `node .claude/scripts/prepare-implementation-plan-state.test.mjs`
  - `bash .claude/scripts/workflow-enforcement.sh verify`
  - `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-closeout-consistency-2026-05-08 --master-plan docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not add a separate operations guide.
- Do not sync downstream projects.
- Do not broadly rewrite README or unrelated docs.

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
- Selected model: gpt-5.5
- Selected model effort: medium
- Model selection reason: stage=phase_implementation; profile=standard
- Retrieval budget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: workflow_core
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Planned Changes
- Files/modules:
  - `.claude/docs/guidelines/meta-harness-trace.md`
  - `.claude/docs/guidelines/product-acceptance-gate.md`
  - `docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`
- Interfaces/contracts:
  - Documentation-only closeout contract alignment.

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Documentation scenarios use open -> act -> mutate -> persist -> recover as file-open/read, targeted doc mutation, persisted file diff, and command-based recovery/verification evidence. Regression scenarios use the exact phase commands and structured verdict output.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Source phase requirements were refreshed into this contract before code/doc edits; no replan or scope narrowing recorded.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 06, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Trace guideline updated | Docs | Required fallback and truth-source terms are present and contextually explained. |
| Acceptance gate updated | Docs | `clean complete` and `complete_with_environment_blocker` are distinguished. |
| Regression commands passed or explicitly blocked | Test | Required phase commands have fresh evidence in QA_REPORT.md. |
| Plan conformance passed | Workflow | `.claude/scripts/verify-plan-conformance.mjs` passes before clean finish. |

## Evaluator Focus
- Core flow: doc readers can determine closeout truth source and completion taxonomy from the guidelines and QA evidence.
- Edge cases: environment-blocked completion is not presented as clean completion; fallback supersede does not erase original verdict history.
- Stub-only behavior to reject: keyword-only doc additions without taxonomy context, missing exact command evidence, or hand-authored verdict JSON.

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `bash .claude/scripts/verify-code-policy.sh`
- workflowEnforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
- shellSyntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/phase-worktree-coordinator.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-closeout-consistency-2026-05-08 --master-plan docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: file-open -> doc mutation -> persisted diff -> command verification -> structured verdict
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Documentation-only scenarios map the minimum to source file reads, bounded edits, persisted artifact updates, and targeted `rg`/regression verification.

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/06-phase-06-docs-and-regression-closeout-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/06-phase-06-docs-and-regression-closeout-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/06-phase-06-docs-and-regression-closeout-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/06-phase-06-docs-and-regression-closeout-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: shell-based workflow verifier may be non-applicable on the current Windows runtime; if blocked, emit a blocked structured verdict instead of blind retry.
- Rollback or safe fallback: keep docs changes minimal and leave phase open with HANDOFF if required commands cannot run.

## Notes
- Generated at: 2026-05-08 13:03:08
