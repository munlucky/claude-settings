# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Controller Contract Pure Function (v1)
- Source plan: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/00-master-plan-v1.md
- Source phase doc: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/01-controller-contract-pure-function-v1.md

## Goal
- Establish the phase-loop controller contract as a pure, deterministic function before runner integration.

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
- Source phase doc: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/01-controller-contract-pure-function-v1.md
- Goal:
  - Establish the controller contract before runner integration.
- Expected outcome:
  - A small deterministic module returns one of exactly six decisions from normalized signals.
  - Unknown or unsafe cases are conservative and return `blocked` or `repair_required`, not implicit retries.
- Scope:
  - In scope:
    - Export a pure function, for example `decidePhaseLoop(signal)`.
    - Accept only the normalized input shape from the v13 plan.
    - Define the six allowed decisions: `continue_execute`, `rerun_review`, `rerun_verify`, `repair_required`, `blocked`, `clean_finish_candidate`.
    - Generate a stable `sourceDecisionId` from normalized input fields, not file contents.
    - Populate `nextAttemptInput.retryStrategy` conservatively.
    - Normalize unknown finalizer failures to `blocked`, `retryRecommended: false`, and a failed case with `class: "unknown_finalizer_failure"`.
  - Out of scope:
    - Reading Markdown, verdict JSON, logs, or filesystem paths.
    - Mutating phase status, runtime state, or execution artifacts.
    - Creating remediation packets.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |----|------|-------|---------------|
  | P01-1 | Define module and constants | 1) Add controller module. 2) Export allowed decision set. 3) Export validation helper if needed. | Consumers can import decisions without duplicating strings. |
  | P01-2 | Implement mapping | 1) Map review failures. 2) Map verify failures. 3) Map finish failures. 4) Map checkpoint failures. 5) Map pass signals. | Every v13 mapping is covered by a unit test. |
  | P01-3 | Fix output shape | 1) Fill defaults for arrays. 2) Preserve phase/attempt/stage. 3) Emit retry strategy and evidence refs. | Snapshot or deep-equality tests prove stable schema. |
  | P01-4 | Prove purity | 1) No `fs` import in controller. 2) Test passes frozen input. 3) Test asserts no mutation of input object. | Controller can run in isolation without fixtures. |
- Exact execution targets:
  | ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
  |----|-----------------|-----------------|---------------|----------|----------------------------|
  | P01-1 | `.claude/scripts/lib/phase-loop-controller.mjs`, `.claude/scripts/lib/phase-loop-controller.test.mjs` | none | same | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | exit 0; all six decision cases covered |
  | P01-2 | none | none | same | `node --check .claude/scripts/lib/phase-loop-controller.mjs` | exit 0 |
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Goal Contract Baseline
- Goal contract path: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/GOAL_CONTRACT.yaml
- Goal contract snapshot id: goal-contract-01-phase-01-controller-contract-pure-function-v1
- Provenance source artifacts: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/00-master-plan-v1.md, docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/01-controller-contract-pure-function-v1.md

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Do not integrate the controller into the runner in this phase.
- Do not read Markdown, verdict JSON, logs, filesystem paths, MemoryGraph output, or CodeReviewGraph output from the controller.
- Do not mutate phase status, runtime state, or execution artifacts from the controller.

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
  - `.claude/scripts/lib/phase-loop-controller.mjs`
  - `.claude/scripts/lib/phase-loop-controller.test.mjs`
- Interfaces/contracts:
  - Export six allowed decisions: `continue_execute`, `rerun_review`, `rerun_verify`, `repair_required`, `blocked`, `clean_finish_candidate`.
  - Export a pure `decidePhaseLoop(signal)` function that consumes normalized signal input only.
  - Return stable output fields: `schemaVersion`, `decision`, `phaseNumber`, `attemptNumber`, `sourceDecisionId`, `retryRecommended`, `failedStage`, `failedCases`, `improvementDirectives`, `evidenceRefs`, and `nextAttemptInput`.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Unit tests exercise normalized input signals, assert deterministic decision output, mutate/freeze inputs to prove purity, and re-run the exact contract verification commands before closeout.
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
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Controller contract module exists | API/Test | `.claude/scripts/lib/phase-loop-controller.mjs` exports the decision constants and `decidePhaseLoop(signal)`. |
| Decision mapping covered | Test | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` covers all six decisions and critical SCN-* mappings. |
| Controller syntax valid | Test | `node --check .claude/scripts/lib/phase-loop-controller.mjs` exits 0. |
| Source plan conformance verified | Workflow | `.claude/scripts/verify-plan-conformance.mjs` passes against active phase artifacts before clean finish. |

## Evaluator Focus
- Core flow: normalized review, verify, finish, checkpoint, and all-pass signals produce the required decision vocabulary without side effects.
- Edge cases: unknown finalizer failures become `blocked`, projection/state inconsistencies become `repair_required`, and missing verification evidence reruns verification.
- Stub-only behavior to reject: hard-coded pass output, filesystem reads, raw Markdown parsing, and incomplete output schema.

## Evidence
### Required Verification Commands
- knowledgeAudit: `bash .claude/scripts/knowledge-repo-audit.sh`
- codePolicy: `node .claude/scripts/verify-code-policy.mjs`
- workflowEnforcement: `node .claude/scripts/workflow-enforcement.mjs verify`
- shellSyntax: `node .claude/scripts/verify-shell-syntax.mjs`
- phaseRuntimeParity: `PHASE_RUNTIME_PARITY_TARGET_RUNTIMES=codex bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- phaseRunnerBoundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- phaseWorktreeParallel: `node .claude/scripts/phase-worktree-coordinator.mjs self-test`
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/phase-runner-simple-controller-refactor-2026-05-13 --master-plan docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: unit-level open -> act -> mutate -> persist -> recover equivalent for pure function contract; no browser/runtime UI applies.
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification: done for unit-level pure-function verification plan.

### Artifacts
- Goal contract: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/GOAL_CONTRACT.yaml
- QA report: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/QA_REPORT.md
- Handoff: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/HANDOFF.md
- Scorecard: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/SCORECARD.md
- Worksets: docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-phase-01-controller-contract-pure-function-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: Phase 02 will define the runner adapter input shape, so Phase 01 must keep the normalized signal contract conservative and filesystem-free.
- Rollback or safe fallback: Revert only the two phase-owned controller files and keep artifact evidence showing verification status.

## Notes
- Generated at: 2026-05-13 04:23:45
- Refreshed for Codex fallback attempt at: 2026-05-13 13:40:00
- Refresh scope: active phase doc, source requirements snapshot, policy anchors, runtime target, and finish/verification gates preserved without replan.
- Refreshed for Codex closeout remediation at: 2026-05-13 13:45:43
- Remediation scope: continue only AT-01 in this isolated attempt; preserve source snapshot, stage order, model routing, and codex verification target.
- Refreshed for Codex remediation blocker review at: 2026-05-13 13:51:37
- Remediation scope: resume from existing AT-01 handoff only; do not restart broad implementation or regenerate equivalent `node --test` EPERM evidence without a concrete runtime remediation.
