# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Runtime Resolver and Dependency Gates (v1)
- Source plan: docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\04-runtime-resolver-and-dependency-gates-v1.md

## Goal
- Implement runtime resolver, runtime fallback tracking, Docker dependency gating, and implementation/meta verifier scope split for phase 04.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.
- Fresh structured verification verdict exists for the active phase attempt.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\04-runtime-resolver-and-dependency-gates-v1.md
- Goal:
  - runtime/command resolver가 exact command 실패와 approved equivalent command 성공을 명시적으로 구분한다.
  - host fallback은 verdict/QA/HANDOFF에 `requestedRuntime`, `effectiveRuntime`, `fallbackReason`으로 남긴다.
  - Docker daemon-required smoke는 static config validation과 분리하고 daemon 부재 시 retry 없이 `resume_later_handoff`로 닫는다.
- Expected outcome:
  - `pnpm`이 PATH에 없고 `corepack pnpm` 또는 host `pnpm`이 가능하면 equivalent evidence로 기록된다.
  - meta verifier failure가 product implementation pass evidence를 덮어쓰지 않는다.
  - Docker daemon이 없으면 `docker compose config`까지는 validation으로 인정하고 `docker compose up --wait`는 external blocker로 handoff된다.
- Scope:
  - approved equivalent command policy
  - package manager/Python/Docker/git/bash resolver contract
  - requested/effective runtime split in verdict state
  - dependency-aware daemon smoke handoff
  - implementation verification vs meta-harness verification scope split
- Detailed tasks:
  - P04-1 command resolver library 추가: exact command, approved equivalent, blocked/network/permission code 반환
  - P04-2 runtime fallback schema 강화: requested/effective runtime/fallbackReason을 verdict/QA/HANDOFF에 기록하고 stale runtime verdict와 phase verifier verdict scope 분리
  - P04-3 Docker dependency gate 구현: `docker compose config` static validation, `docker info` daemon probe, daemon missing은 no-retry handoff
  - P04-4 implementation/meta verifier 분리: product test pass evidence 보존, meta verifier blocker는 separate closeout scope로 기록
- Exact execution targets:
  - P04-1 | `.claude/scripts/lib/command-resolver.mjs` | `.claude/scripts/runtime-cli.mjs` | `.claude/scripts/lib/command-resolver.test.mjs` | `node .claude/scripts/lib/command-resolver.test.mjs` | `command-resolver self-test passed`
  - P04-2 | 없음 | `.claude/scripts/write-verification-verdict.py`, `.claude/scripts/verification-verdict-state.mjs` | existing self-test | `node .claude/scripts/verification-verdict-state.mjs self-test` | `verification-verdict-state self-test passed`
  - P04-3 | 없음 | `.claude/scripts/phase-capability-preflight.mjs`, `.claude/verification.contract.yaml` | command resolver fixture | `node .claude/scripts/phase-capability-preflight.mjs --json` | Docker daemon status classified, not retried
  - P04-4 | 없음 | `.claude/scripts/agent-loop-phase-runner.mjs` | command resolver fixture | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | exit code 0
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
  - `.claude/scripts/lib/command-resolver.mjs`
  - `.claude/scripts/lib/command-resolver.test.mjs`
  - `.claude/scripts/runtime-cli.mjs`
  - `.claude/scripts/verification-verdict-state.mjs`
  - `.claude/scripts/write-verification-verdict.py`
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/verification.contract.yaml`
- Interfaces/contracts:
  - exact command vs approved equivalent command resolution
  - requestedRuntime / effectiveRuntime / fallbackReason verdict fields
  - Docker static config validation vs daemon probe split
  - implementation verifier evidence preserved separately from meta verifier blocker scope

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
  - Phase 04 contract snapshot refreshed from Korean source headings before host closeout.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 04, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation --master-plan docs/implementation/00-master-plan-v1.md`
- planConformance: `node .claude/scripts/verify-plan-conformance.mjs --phase-doc docs/implementation/harness-reliability-retro-2026-05-05/04-runtime-resolver-and-dependency-gates-v1.md --sprint-contract docs/implementation/harness-reliability-retro-2026-05-05/execution/04-phase-04-runtime-resolver-and-dependency-gates-v1/SPRINT_CONTRACT.md`

### Runtime Flow
- Runtime evidence depth: open -> act -> mutate -> persist -> recover
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-reliability-retro-2026-05-05/execution/04-phase-04-runtime-resolver-and-dependency-gates-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-reliability-retro-2026-05-05/execution/04-phase-04-runtime-resolver-and-dependency-gates-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-reliability-retro-2026-05-05/execution/04-phase-04-runtime-resolver-and-dependency-gates-v1/SCORECARD.md
- Worksets: docs/implementation/harness-reliability-retro-2026-05-05/execution/04-phase-04-runtime-resolver-and-dependency-gates-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, finish-stage closeout recorded, and plan conformance passing.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: 2026-05-05 09:54:41
