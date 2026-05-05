# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Runtime Parity Fixture and Archive Safety (v1)
- Source plan: docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\03-runtime-parity-fixture-archive-safety-v1.md

## Goal
- Fill before code changes with the user-visible outcome for this round.

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
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\03-runtime-parity-fixture-archive-safety-v1.md
- Goal:
  - runtime parity smoke가 `.claude/docs/runtime-parity-reference-plan` 원본과 `.claude/docs/phase-status.yaml`를 오염시키지 않도록 한다.
  - archive sync는 실제 plan root의 completed phase만 대상으로 삼고 reference fixture 경로는 제외한다.
  - active phase discovery는 root 파일 개수가 아니라 `phase-status.yaml` 상태를 우선한다.
- Expected outcome:
  - parity smoke 전후로 reference fixture hash가 동일하다.
  - `archivedPhaseDoc`에 runtime parity reference fixture 경로가 들어가지 않는다.
  - completed phase archive와 active candidate 계산이 close/ 이동 후에도 일관된다.
- Scope:
  - temp directory copy 기반 runtime parity smoke
  - source fixture hash/diff guard
  - archive sync include/exclude guard
  - phase-status authoritative traversal correction
- Detailed tasks:
  - P03-1 parity temp fixture 실행: temp dir 생성, reference fixture copy, smoke에 temp path 전달, temp artifact path 기록
  - P03-2 archive sync guard: reference fixture path exclude, plan root allowlist 적용, archivedPhaseDoc validation 추가
  - P03-3 phase-status traversal correction: total/planned/completed source를 phase-status로 통일, root/close fallback 순서 명시
- Exact execution targets:
  - P03-1 | 없음 | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | runtime parity fixture | `node .claude/scripts/verify-phase-runtime-parity.mjs --compact .claude/docs/runtime-parity-reference-plan` | `phase runtime parity smoke passed` 또는 environment blocker classified
  - P03-2 | 없음 | `.claude/scripts/sync-phase-archive.py` | archive pollution fixture | `python .claude/scripts/sync-phase-archive.py --help` | command loads without syntax/runtime path error
  - P03-3 | 없음 | `.claude/scripts/agent-loop-phase-state.mjs` | phase state fixture | `node --check .claude/scripts/agent-loop-phase-state.mjs` | exit code 0
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
- Interfaces/contracts:

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Define before implementation. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
  - Refreshed for phase 03 attempt start before implementation.

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

### Runtime Flow
- Runtime evidence depth: open -> act -> mutate -> persist -> recover
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Evidence must include hash stability, archive exclusion, and authoritative traversal checks.

### Artifacts
- QA report: docs/implementation/harness-reliability-retro-2026-05-05/execution/03-phase-03-runtime-parity-fixture-and-archive-safety-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-reliability-retro-2026-05-05/execution/03-phase-03-runtime-parity-fixture-and-archive-safety-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-reliability-retro-2026-05-05/execution/03-phase-03-runtime-parity-fixture-and-archive-safety-v1/SCORECARD.md
- Worksets: docs/implementation/harness-reliability-retro-2026-05-05/execution/03-phase-03-runtime-parity-fixture-and-archive-safety-v1/WORKSETS.yaml

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
- Generated at: 2026-05-05 09:39:15
