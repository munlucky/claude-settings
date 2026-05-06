# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Native Harness Capture (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/03-native-harness-capture-v1.md

## Goal
- Implement the first atomic slice of Phase 03 by wiring native harness capture around phase-runner lifecycle and event logging boundaries without widening scope beyond the active phase doc.

## Success Criteria
- In-scope source-plan requirements for the selected atomic task are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before any clean-finish claim.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/03-native-harness-capture-v1.md
- Goal:
  - phase runner, command wrapper, verifier wrapper, memory read boundary, and file reconciliation boundary automatically record AWTL events.
- Expected outcome:
  - `/moonshot-phase-runner` path executions create `.claude/traces/<run-id>/agent_work_trace.jsonl`.
  - logging failure is warning-only and does not contaminate the phase verdict.
- Scope:
  - Included events: `run_started`, `attempt_started`, `span_started`, `action_started`, `action_completed`, `judge_result`, `memory_read`, `file_reconciliation`, `run_completed`, `privacy_event`.
  - Included metadata: command exit code, duration, stdout/stderr hash and redacted excerpt metadata, verifier verdict mapping to `judge_result`, MemoryGraph read query hash/node ids/tags only, `git diff --name-only` file reconciliation event.
  - Excluded work: attribution ranking, memory candidate creation, transcript importer backfill.
- Detailed tasks:
  - P03-1: run/attempt/span lifecycle capture with dispatcher run id generation, attempt lifecycle recording, and span parent/child linkage.
  - P03-2: command/verifier wrapper capture with before/after command recording, verifier verdict mapping to `judge_result`, and logging failure warning handling.
  - P03-3: memory read event capture with query hash, no raw content, and ids/tags only.
  - P03-4: file reconciliation capture with phase pre/post git touched files, artifact_refs, and repo-relative paths only.
  - P03-5: runtime parity regression with existing verification commands and logging disabled/failure fixture coverage.
- Exact execution targets:
  - `.claude/scripts/lib/awtl-harness-capture.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop-phase-attempt.mjs`
  - `.claude/scripts/agent-loop-shell-core.sh`
  - `.claude/scripts/workflow-enforcement.mjs`
  - `.claude/scripts/lib/awtl-harness-capture.test.mjs`
  - `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs`
  - `bash -n .claude/scripts/agent-loop-shell-core.sh`
  - `bash .claude/scripts/verify-phase-runner-boundary.sh`
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan recorded in the Spec Deviation Ledger before this phase can close.

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
  - `.claude/scripts/lib/awtl-harness-capture.mjs`
  - `.claude/scripts/lib/awtl-harness-capture.test.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop-phase-attempt.mjs`
- Interfaces/contracts:
  - Add lifecycle capture helpers that emit run/attempt/span events through the existing trace sink boundary.
  - Preserve wrapper integrations so command/verifier/memory/file reconciliation hooks can attach to the same trace schema.

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Capture native harness lifecycle evidence first, then verify command and verifier linkage, memory boundary redaction, and file reconciliation path normalization with fresh test output.
- Round fail conditions: Missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Active attempt is constrained to AT-01 only; later capture slices remain out of scope for this attempt.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 03, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: auto

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Native lifecycle capture | Test | run/attempt/span events appear in order in the harness trace test |
| Trace sink linkage | Test | lifecycle events connect through source action ids without raw payload leakage |

## Evaluator Focus
- Core flow: lifecycle capture emitted through the existing harness trace sink boundary.
- Edge cases: logging failure warnings do not corrupt the primary verdict path.
- Stub-only behavior to reject: direct JSONL writing that bypasses `awtl-trace-sink.mjs`.

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
- Runtime evidence depth: native lifecycle capture with test-backed trace emission
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fresh evidence will be recorded in QA_REPORT.md before any finish-stage claim.

### Artifacts
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-phase-03-native-harness-capture-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-phase-03-native-harness-capture-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-phase-03-native-harness-capture-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/03-phase-03-native-harness-capture-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: first atomic slice may need to remain partially complete if the selected task cannot be fully verified in this attempt.
- Rollback or safe fallback: keep the phase open, record the blocking evidence, and continue with the next attempt.

## Notes
- Generated at: 2026-05-06 03:35:57
- ActiveAtomicTask: AT-01
- Attempt mode: isolated phase-attempt fallback for codex runtime
