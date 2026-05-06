# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Turn Identity Capture (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/02-turn-identity-capture-v1.md

## Goal
- Capture the active phase attempt as a single logical turn and propagate that turn id through capture events and runner instrumentation.

## Success Criteria
- `createPhaseHarnessCaptureSession` emits a phase/attempt-scoped turn id and tracks the current turn.
- capture APIs accept an optional `turnId` and write it into the event envelope.
- the phase runner uses the same turn id for worker prompt, completion judge, and reconciliation captures.
- regression tests cover same-turn lifecycle and retry/remediation separation.
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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/02-turn-identity-capture-v1.md
- Goal:
  - AWTL event envelope의 기존 `turn_id`를 실제 phase attempt 단위로 채운다.
  - worker prompt action, completion judge, file reconciliation, memory read가 같은 logical turn에 묶이게 한다.
- Expected outcome:
  - `turn-<phase>-<attempt>-<seq>-<shortuuid>` 형식의 turn id가 capture event에 기록된다.
  - retry/remediation attempt는 새 `turn_id`를 갖고 같은 run/attempt context에 연결된다.
- Scope:
  - 포함:
    - `createPhaseHarnessCaptureSession`에 turn id generator와 current turn state 추가
    - capture record APIs에 optional `turnId` 전달
    - phase runner worker prompt/judge/file reconciliation capture에 turn id 적용
  - 제외:
    - 새로운 trace event type 추가
    - failure case 저장
    - prompt brief injection
- Detailed tasks:
  - P02-1 | turn id generator 추가 | 1) `beginTurn(details)` 구현 2) phase/attempt/seq/shortuuid 형식 고정 3) currentTurnId state 관리 | deterministic format assertion pass
  - P02-2 | capture APIs에 turnId 전파 | 1) `emit` override에 `turnId` 추가 2) record APIs가 envelope `turn_id`에 반영 | action/judge/memory/file events에 turn id 존재
  - P02-3 | phase runner capture 연결 | 1) attempt 시작 뒤 turn 발급 2) worker prompt action과 completion judge에 같은 turn id 전달 3) retry loop에서 새 turn 발급 | runner-generated trace에서 turn grouping 확인
  - P02-4 | 회귀 테스트 보강 | 1) `awtl-harness-capture.test.mjs`에 same-turn lifecycle 테스트 추가 2) retry/remediation separate turn 테스트 추가 | `node --test` pass
- Exact execution targets:
  - | ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
  - |----|-----------|-----------|-------------|------|------------------------|
  - | P02-1 | none | `.claude/scripts/lib/awtl-harness-capture.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | turn id format assertion pass |
  - | P02-2 | none | `.claude/scripts/lib/awtl-harness-capture.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | action/judge/memory/file events share turn id |
  - | P02-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | existing runner smoke | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | syntax pass |
  - | P02-4 | none | none | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs` | trace + capture tests pass |
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Add new trace event types.
- Implement failure-case storage.
- Inject prompt brief content into worker prompts.

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
  - `.claude/scripts/agent-loop-phase-runner.mjs`
- Interfaces/contracts:
  - optional `turn_id` propagation inside AWTL capture envelopes
  - turn lifecycle state on the phase harness capture session

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: record same-turn event samples from capture tests, runner syntax evidence, and retry-separation verification for the turn lifecycle.
- Round fail conditions: Missing contract review, missing runtime evidence plan, stale verification, or a mismatch between QA/SCORECARD and the actual turn-id behavior.
- Contract revision required: no
- Review notes: phase scope is bounded to AT-01 only.

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
| turn id format | Test | deterministic phase/attempt/seq/shortuuid turn ids are generated |
| event propagation | API/Test | worker prompt, judge, and reconciliation captures share the same turn id |
| retry separation | Test | retry/remediation starts a new turn id |
| runner syntax | CLI | `node --check .claude/scripts/agent-loop-phase-runner.mjs` passes |

## Evaluator Focus
- Core flow: capture a single turn across prompt, judge, and reconciliation events.
- Edge cases: retry/remediation must not reuse the previous turn id.
- Stub-only behavior to reject: changes that only update tests or docs without wiring turn ids through the capture path.

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

### Runtime Flow
- Runtime evidence depth: turn-lifecycle capture evidence from unit tests plus runner syntax verification
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/02-phase-02-turn-identity-capture-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/02-phase-02-turn-identity-capture-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/02-phase-02-turn-identity-capture-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/02-phase-02-turn-identity-capture-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 13:20:22
