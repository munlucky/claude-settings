# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Capability and Fingerprint Foundation (v1)
- Source plan: docs\implementation\harness-reliability-retro-2026-05-05\00-master-plan-v1.md
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\01-capability-fingerprint-foundation-v1.md

## Goal
- Implement phase 01 capability preflight enrichment, canonical failure fingerprinting, and retry suppression wiring for environment blockers.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- `node .claude/scripts/lib/failure-classifier.test.mjs` passes.
- `node .claude/scripts/phase-capability-preflight.mjs --json` emits the expected enriched schema.
- `node --check .claude/scripts/agent-loop-phase-runner.mjs` passes.
- Review, verification, scorecard, and handoff evidence agree before clean finish.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\01-capability-fingerprint-foundation-v1.md
- Goal:
  - phase 시작 전에 command/runtime capability를 JSON artifact로 확정한다.
  - 반복 가능한 failure를 canonical code와 fingerprint로 정규화한다.
  - environment/external blocker는 구현 재시도가 아니라 handoff 또는 fallback 판단으로 라우팅한다.
- Expected outcome:
  - `node .claude/scripts/phase-capability-preflight.mjs --json`가 `capabilities`, `decision`, `reason`, `failureClassCounts`를 포함한다.
  - `bash_access_denied`, `git_eperm`, `network_fetch_failed`, `docker_daemon_unavailable` 같은 failure code가 안정적으로 동일 fingerprint를 만든다.
  - 같은 phase에서 동일 environment fingerprint가 2회 이상 반복되면 runner가 auto-fix loop로 들어가지 않는다.
- Scope:
  - capability matrix schema 확장
  - canonical failure code와 stable fingerprint library
  - runner retry decision에 same-fingerprint signal 연결
  - blocker와 fallback hint를 preflight artifact에 기록
  - 제외: artifact 문서 schema normalizer 구현, Docker daemon smoke 실행 자체, timing telemetry persistence
- Detailed tasks:
  - P01-1 failure classifier library 추가
  - P01-2 capability preflight schema 확장
  - P01-3 retry suppression signal 연결
- Exact execution targets:
  - `.claude/scripts/lib/failure-classifier.mjs`
  - `.claude/scripts/lib/failure-classifier.test.mjs`
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
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
  - `.claude/scripts/lib/failure-classifier.mjs`
  - `.claude/scripts/lib/failure-classifier.test.mjs`
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
- Interfaces/contracts:
  - failure classifier canonical code + stable fingerprint contract
  - preflight JSON schema with capability, decision, reason, and failureClassCounts
  - runner retry suppression input from same-fingerprint count

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence. For this phase, verify classifier self-test, preflight JSON schema, and runner syntax in that order.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: Refresh performed before implementation batch.

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
| Failure classifier self-test | Test | `node .claude/scripts/lib/failure-classifier.test.mjs` exits 0 and reports stable fingerprints |
| Capability preflight schema | API/Test | `node .claude/scripts/phase-capability-preflight.mjs --json` includes `capabilities`, `decision`, `reason`, `failureClassCounts` |
| Runner syntax | Test | `node --check .claude/scripts/agent-loop-phase-runner.mjs` exits 0 |

## Evaluator Focus
- Core flow: canonicalize environment failures and propagate the suppression signal into preflight and runner decision paths.
- Edge cases: repeated identical blocker fingerprints, empty or unknown failure input, and blocker/fallback decision routing.
- Stub-only behavior to reject: hard-coded fingerprints, schema fields that exist only in docs, or retry suppression that does not read the computed fingerprint count.

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
- Evidence note: classifier and preflight are the primary runtime artifacts for this phase.

### Artifacts
- QA report: docs/implementation/harness-reliability-retro-2026-05-05/execution/01-phase-01-capability-and-fingerprint-foundation-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-reliability-retro-2026-05-05/execution/01-phase-01-capability-and-fingerprint-foundation-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-reliability-retro-2026-05-05/execution/01-phase-01-capability-and-fingerprint-foundation-v1/SCORECARD.md
- Worksets: docs/implementation/harness-reliability-retro-2026-05-05/execution/01-phase-01-capability-and-fingerprint-foundation-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Runtime availability for codex-target verification and shell compatibility on this host.
- Rollback or safe fallback:
- If verification is blocked, record a blocked verdict and preserve the retry decision evidence instead of looping blind.

## Notes
- Generated at: 2026-05-05 08:56:43
