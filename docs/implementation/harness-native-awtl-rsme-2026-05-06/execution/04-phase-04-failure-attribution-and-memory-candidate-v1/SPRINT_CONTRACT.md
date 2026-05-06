# Phase 04 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 4
- Title: Phase 04: Failure Attribution and Memory Candidate (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/04-failure-attribution-memory-candidate-v1.md

## Goal
- Implement deterministic failure attribution, memory candidate schema/writer, LLM boundary restrictions, and promotion-blocker policy for the phase 4 scope.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/04-failure-attribution-memory-candidate-v1.md
- Goal:
  - `failed verifier check`를 trace event와 touched files에 deterministic하게 연결하고, 검증 가능한 memory candidate를 생성한다.
- Expected outcome:
  - candidate에는 `source_action_ids`, `failure_type`, `failure_class`, `root_cause_summary`, `proposed_memory`, `scope`, `evidence_refs`, `verification_probe_candidate`, blocker/status가 포함된다.
  - environment/flaky/harness failure는 기본적으로 MemoryGraph promotion blocked 상태가 된다.
- Scope:
  - deterministic attribution chain
  - heuristic fallback with lower confidence
  - LLM attribution boundary adapter placeholder that is disabled by default in tests
  - memory candidate schema and writer to `memory_update_candidates.jsonl`
  - promotion blockers for environment/flaky/harness failures
- Detailed tasks:
  - P04-1 | Deterministic attribution 구현 | 1. failed check artifact/file lookup 2. touched file lookup 3. last modifying action lookup 4. command/verifier adjacency lookup 5. memory_read node ids lookup | fixture에서 expected source action ids가 stable하게 선택됨
  - P04-2 | Memory candidate schema/writer 구현 | 1. schema 작성 2. candidate id 생성 3. evidence refs 필수화 4. JSONL write | missing scope/evidence/source action/probe candidate가 reject됨
  - P04-3 | LLM boundary 제한 | 1. raw trace logging에서 LLM 사용 금지 test 2. optional summarizer input을 redacted attribution summary로 제한 | test에서 raw stdout/prompt가 summarizer input에 없음
  - P04-4 | Promotion blocker 정책 구현 | 1. environment/flaky/harness class blocked 2. confidence/requires_human_review 계산 3. blocker reason 저장 | env/network/flaky fixture가 `promotion_status: blocked` 또는 blocker 포함
- Exact execution targets:
  - P04-1 | `.claude/scripts/lib/awtl-failure-attribution.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: wrong source action id. Pass: expected attribution chain selected
  - P04-2 | `.claude/schemas/awtl-memory-candidate-v1.schema.json`, `.claude/scripts/lib/awtl-memory-candidate.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: invalid candidate accepted. Pass: missing required fields rejected
  - P04-3 | `.claude/scripts/awtl-failure-analyzer.mjs` | none | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --check .claude/scripts/awtl-failure-analyzer.mjs` | Fail: syntax error or raw logging path. Pass: exit 0
  - P04-4 | none | `.claude/scripts/lib/awtl-memory-candidate.mjs` | `.claude/scripts/lib/awtl-failure-attribution.test.mjs` | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs` | Fail: env failure promotion allowed. Pass: blocked
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
  - `.claude/schemas/awtl-memory-candidate-v1.schema.json`
  - `.claude/scripts/lib/awtl-failure-attribution.mjs`
  - `.claude/scripts/lib/awtl-memory-candidate.mjs`
  - `.claude/scripts/lib/awtl-failure-attribution.test.mjs`
  - `.claude/scripts/awtl-failure-analyzer.mjs`
- Interfaces/contracts:
  - deterministic attribution chain from failed verifier to source action ids
  - memory candidate validation with required evidence refs, scope, source action ids, and probe candidate
  - promotion blocker policy for environment/flaky/harness failure classes

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: deterministic attribution fixture, invalid-candidate rejection, and blocked promotion evidence. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes: AT-01 is the only active atomic task in this attempt; no second atomic task will be started.

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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file .claude/docs/phase-status.yaml --plan-dir docs/implementation/harness-native-awtl-rsme-2026-05-06 --master-plan docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-phase-04-failure-attribution-and-memory-candidate-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-phase-04-failure-attribution-and-memory-candidate-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-phase-04-failure-attribution-and-memory-candidate-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/04-phase-04-failure-attribution-and-memory-candidate-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 04:15:44
