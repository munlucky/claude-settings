# Phase 05 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 5
- Title: Phase 05: Environment-Blocked Verdict Normalizer (v1)
- Source plan: docs/implementation/harness-closeout-consistency-2026-05-08/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/05-environment-blocked-verdict-normalizer-v1.md

## Goal
- External provider smoke가 환경 문제로 막힌 경우 clean complete로 기록하지 않고 `normalizedRunVerdict: complete_with_environment_blocker`와 `environmentBlockers`를 같은 closeout artifact surface에 기록한다.

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
- Source phase doc: docs/implementation/harness-closeout-consistency-2026-05-08/05-environment-blocked-verdict-normalizer-v1.md
- Goal:
  - external provider smoke가 환경 문제로 막힌 경우 `clean_finish` 또는 clean complete로 기록하지 않는다.
  - `normalizedRunVerdict: complete_with_environment_blocker`와 `environmentBlockers`를 기록한다.
  - scorecard/QA/verdict 문구가 같은 normalized verdict를 사용한다.
- Expected outcome:
  - 모든 required smoke가 통과해야만 clean complete가 허용된다.
  - 환경 문제로 막힌 external smoke는 local implementation completion과 구분된다.
- Scope:
  - 포함: `complete_with_environment_blocker` normalized verdict, `environmentBlockers: [{ check, reason, evidencePath, observedAt }]`, QA/HANDOFF/SCORECARD wording alignment, clean complete blocker in verifier/workflow gate.
  - 제외: provider-specific smoke implementation, credentials provisioning, external account workflow automation.
- Detailed tasks:
  - P05-1: normalized verdict vocabulary 확장.
  - P05-2: environmentBlockers field 기록.
  - P05-3: clean complete gate 수정.
  - P05-4: scorecard/QA/verdict 문구 정합화.
- Exact execution targets:
  - P05-1: `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs`; command `node .claude/scripts/verify-phase-closeout.test.mjs`.
  - P05-3: `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs`; command `node .claude/scripts/verify-phase-closeout.test.mjs`.
  - P05-4: `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/render-scorecard.py`, `.claude/scripts/verify-phase-closeout.test.mjs`; command `node .claude/scripts/verify-phase-closeout.test.mjs`.
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Provider-specific smoke implementation.
- Credentials provisioning.
- External account workflow automation.

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
- Files/modules: `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/render-scorecard.py`, `.claude/scripts/verify-phase-closeout.test.mjs`.
- Interfaces/contracts: normalized verdict vocabulary adds `complete_with_environment_blocker`; closeout/status artifacts may expose `environmentBlockers` entries with `check`, `reason`, `evidencePath`, and `observedAt`.

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: run the phase exact target `node .claude/scripts/verify-phase-closeout.test.mjs`; then run required workflow/closeout commands from this contract, generate a structured verification verdict, and run source plan conformance before clean finish.
- Round fail conditions: environment-blocked smoke still maps to clean complete, `environmentBlockers` is absent or malformed, SCORECARD/QA/verdict wording diverges, missing structured verdict, failing plan conformance, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: refreshed for Codex direct phase-attempt at 2026-05-08 21:55:28 +09:00.

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
| Normalized verdict | API/Test | environment-blocked required smoke yields `complete_with_environment_blocker`, not `clean_finish`. |
| Blocker payload | API/Test | `environmentBlockers` includes `check`, `reason`, `evidencePath`, and `observedAt`. |
| Clean finish gate | API/Test | missing required smoke blocks FULL/done clean closeout. |
| Artifact wording | Artifact/Test | QA, SCORECARD, HANDOFF, and verification verdict use aligned environment-blocked wording. |

## Evaluator Focus
- Core flow: required smoke blocked by environment is represented as complete-with-environment-blocker and remains distinct from implementation failure and clean finish.
- Edge cases: missing smoke evidence, malformed blocker entries, mixed passed local checks plus blocked external checks, and stale verdict paths.
- Stub-only behavior to reject: hard-coded artifact text without closeout verifier coverage, clean success aliases that bypass `environmentBlockers`, or scorecard FULL/done while required smoke is unresolved.

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
- Runtime evidence depth: code-level fixture plus workflow closeout verification; critical SCN-* evidence must cover mutate/persist/recover via generated artifacts or verifier fixtures, not smoke-only text.
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification: exact target test first, then contract verification commands and plan conformance.

### Artifacts
- QA report: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/05-phase-05-environment-blocked-verdict-normalizer-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/05-phase-05-environment-blocked-verdict-normalizer-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/05-phase-05-environment-blocked-verdict-normalizer-v1/SCORECARD.md
- Worksets: docs/implementation/harness-closeout-consistency-2026-05-08/execution/harness-closeout-consistency-v1/05-phase-05-environment-blocked-verdict-normalizer-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: existing closeout artifact writer boundaries may already be partially updated by earlier attempts; preserve compatible behavior and avoid expanding to provider-specific smoke implementation.
- Rollback or safe fallback: if runtime/tool availability blocks a required verifier, generate a blocked structured verification verdict and keep the phase in retry/blocked with handoff evidence.

## Notes
- Generated at: 2026-05-08 12:54:58
