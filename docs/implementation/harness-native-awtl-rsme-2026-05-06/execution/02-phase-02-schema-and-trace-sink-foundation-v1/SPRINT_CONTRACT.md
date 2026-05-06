# Phase 02 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 2
- Title: Phase 02: Schema and Trace Sink Foundation (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/02-schema-trace-sink-foundation-v1.md

## Goal
- Implement the `awtl.event.v1` schema, append-only trace sink, and CLI self-test path so phase 02 can persist ordered, redacted trace events and materialize `judge_result.jsonl` from the canonical log.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/02-schema-trace-sink-foundation-v1.md
- Goal:
  - Implement the `awtl.event.v1` JSON schema and append-only trace sink.
  - Verify parallel append, corrupt-line quarantine, and redaction helper integration.
- Expected outcome:
  - Later phases can record AWTL events through the same API.
  - `agent_work_trace.jsonl` and `judge_result.jsonl` are separated as canonical log and materialized view in code and docs.
- Scope:
  - Include `awtl.event.v1` schema, event ordering helper, lock-file based append sink, corrupt partial line quarantine, redacted excerpt/hash/artifact_refs write path, and `judge_result.jsonl` materialized view writer.
  - Exclude phase runner runtime hook connection, attribution algorithm, and replay/promotion gate.
- Detailed tasks:
  - `P02-1` Event schema 작성
  - `P02-2` Append-only sink 구현
  - `P02-3` Materialized view writer 구현
  - `P02-4` Crash/privacy regression 추가
- Exact execution targets:
  - `P02-1 | .claude/schemas/awtl-event-v1.schema.json, .claude/scripts/lib/awtl-event-schema.mjs | none | .claude/scripts/lib/awtl-trace-sink.test.mjs | node --test .claude/scripts/lib/awtl-trace-sink.test.mjs | Fail: missing fields accepted. Pass: schema tests reject invalid events`
  - `P02-2 | .claude/scripts/lib/awtl-trace-sink.mjs | none | .claude/scripts/lib/awtl-trace-sink.test.mjs | node --test .claude/scripts/lib/awtl-trace-sink.test.mjs | Fail: corrupt JSONL or duplicate seq. Pass: parallel append is parseable`
  - `P02-3 | .claude/scripts/awtl-trace.mjs | .claude/scripts/lib/awtl-trace-sink.mjs | .claude/scripts/lib/awtl-trace-sink.test.mjs | node .claude/scripts/awtl-trace.mjs self-test | Fail: canonical/index mismatch. Pass: self-test exits 0`
  - `P02-4 | none | .claude/docs/guidelines/awtl-rsme.md, .claude/docs/guidelines/awtl-rsme.ko.md | .claude/scripts/lib/awtl-trace-sink.test.mjs | node --check .claude/scripts/awtl-trace.mjs | Fail: syntax error. Pass: exit 0`
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
  - `.claude/schemas/awtl-event-v1.schema.json`
  - `.claude/scripts/lib/awtl-event-schema.mjs`
  - `.claude/scripts/lib/awtl-trace-sink.mjs`
  - `.claude/scripts/lib/awtl-trace-sink.test.mjs`
  - `.claude/scripts/awtl-trace.mjs`
- Interfaces/contracts:
  - schema validation for required envelope fields, event types, and payload shape
  - append-only JSONL sink with lock-file coordination, ingest sequence assignment, quarantine handling, and redaction-before-write
  - canonical-log-backed `judge_result.jsonl` materialized view writer
  - CLI self-test command for phase evidence

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover for parallel append, quarantine, and redaction paths; record the exact verification command and verdict file in QA_REPORT.md during execution.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
  - Phase 02 stays isolated to schema/sink foundation work.
  - Implementation must use existing redaction and taxonomy helpers rather than duplicating policy logic.
  - Attempt checkpoint refreshed at 2026-05-06 03:15:18 for the phase-attempt fallback path.
  - Current attempt is isolated to AT-01 with codex verification target.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 02, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: codex
- Verification runtime target: codex

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Schema validation | Test | Missing required envelope fields or unsupported event types are rejected |
| Append-only sink | API/Test | Parallel appends produce parseable JSONL with monotonic ingest sequence assignment |
| Quarantine path | Test | Partial/corrupt lines are quarantined instead of poisoning the canonical log |
| Redaction-before-write | API/Test | Secret-like values are hashed or dropped before event persistence |
| CLI self-test | API/Test | `node .claude/scripts/awtl-trace.mjs self-test` exits 0 and reports a trace directory path |

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
- phaseCloseout: `PHASE_STATUS_FILE=.claude/docs/phase-status.yaml PHASE_PLAN_DIR=docs/implementation/harness-native-awtl-rsme-2026-05-06 PHASE_MASTER_PLAN=docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md node .claude/scripts/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}`

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-phase-02-schema-and-trace-sink-foundation-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-phase-02-schema-and-trace-sink-foundation-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-phase-02-schema-and-trace-sink-foundation-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/02-phase-02-schema-and-trace-sink-foundation-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 03:01:15
