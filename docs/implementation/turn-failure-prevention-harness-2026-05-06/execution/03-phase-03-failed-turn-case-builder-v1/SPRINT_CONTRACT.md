# Phase 03 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 3
- Title: Phase 03: Failed Turn Case Builder (v1)
- Source plan: docs/implementation/turn-failure-prevention-harness-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/03-failed-turn-case-builder-v1.md

## Goal
- Build compact failed-turn case records from failed judge results, keep them raw-free, and append them to the ignored awtl cache for next-run recall.

## Success Criteria
- `awtl-failed-turn-case` schema and builder exist and reject raw trace leakage.
- Failed judge results append compact case records to `.claude/cache/awtl/failed_turn_cases.jsonl`.
- `failure_turn_id` is carried through attribution and memory candidate provenance.
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
- Source phase doc: docs/implementation/turn-failure-prevention-harness-2026-05-06/close/03-failed-turn-case-builder-v1.md
- Goal:
  - 실패한 턴에서 재발 방지에 필요한 compact case를 생성한다.
  - case는 장기 메모리가 아니라 ignored cache이며, 다음 run recall의 입력으로만 저장된다.
- Expected outcome:
  - `.claude/cache/awtl/failed_turn_cases.jsonl`에 failed turn case가 append된다.
  - case는 `turn_id`, `failure_event_id`, `artifact_refs`, `memory_read_node_ids`, `prevention_hint`, applicability scope를 갖는다.
  - raw stdout/stderr, prompt body, secret-like string은 case에 포함되지 않는다.
- Scope:
  - `awtl-failed-turn-case-v1` schema 추가
  - failed judge result에서 case 생성
  - `failure_turn_id`를 attribution/candidate에 포함
  - ignored cache write helper 추가
- Detailed tasks:
  - P03-1 | failed turn case schema 추가 | 1) required fields 정의 2) additionalProperties 정책 결정 3) confidence/applicability fields 포함 | valid/invalid schema tests pass
  - P03-2 | case builder 구현 | 1) attribution에서 `turn_id` 추출 2) artifact/memory refs 정규화 3) compact prevention hint 생성 | raw body 없이 compact case 생성
  - P03-3 | candidate와 attribution 확장 | 1) `failure_turn_id`를 memory candidate top-level/scope에 추가 2) evidence refs에 turn provenance 추가 | 기존 candidate tests pass
  - P03-4 | CLI/cache write 연결 | 1) `awtl-failure-analyzer.mjs`에 `--failed-turn-cases-output` 옵션 추가 2) 기본 output `.claude/cache/awtl/failed_turn_cases.jsonl` | analyzer 실행 시 candidate와 case 모두 생성
- Exact execution targets:
  - P03-1 | `.claude/schemas/awtl-failed-turn-case-v1.schema.json` | none | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs` | schema valid/invalid tests pass
  - P03-2 | `.claude/scripts/lib/awtl-failed-turn-case.mjs` | none | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs` | raw-free prevention hint assertions pass
  - P03-3 | none | `.claude/scripts/lib/awtl-failure-attribution.mjs`, `.claude/scripts/lib/awtl-memory-candidate.mjs`, `.claude/schemas/awtl-memory-candidate-v1.schema.json` | existing attribution/candidate tests | `node --test .claude/scripts/lib/awtl-failure-attribution.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs` | existing behavior preserved with new field
  - P03-4 | none | `.claude/scripts/awtl-failure-analyzer.mjs` | `.claude/scripts/lib/awtl-failed-turn-case.test.mjs` | `node --check .claude/scripts/awtl-failure-analyzer.mjs` | syntax pass
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
  - `.claude/schemas/awtl-failed-turn-case-v1.schema.json`
  - `.claude/scripts/lib/awtl-failed-turn-case.mjs`
  - `.claude/scripts/lib/awtl-failure-attribution.mjs`
  - `.claude/scripts/lib/awtl-memory-candidate.mjs`
  - `.claude/scripts/awtl-failure-analyzer.mjs`
  - `.claude/scripts/lib/awtl-failed-turn-case.test.mjs`
  - `.claude/scripts/lib/awtl-failure-attribution.test.mjs`
  - `.claude/scripts/lib/awtl-memory-promotion.test.mjs`
- Interfaces/contracts:
  - Failed-turn case shape: `turn_id`, `failure_event_id`, `artifact_refs`, `memory_read_node_ids`, `prevention_hint`, `applicability`, `evidence_refs`.
  - Memory candidate provenance: `failure_turn_id` at top level and under `scope`.
  - Analyzer CLI: `--failed-turn-cases-output` with default `.claude/cache/awtl/failed_turn_cases.jsonl`.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover evidence for failed-turn case generation, plus raw-exclusion assertions on both candidate and case outputs.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

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
- phaseCloseout: `node .claude/scripts/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.claude/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}`

### Runtime Flow
- Runtime evidence depth: open -> act -> mutate -> persist -> recover
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/03-phase-03-failed-turn-case-builder-v1/QA_REPORT.md
- Handoff: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/03-phase-03-failed-turn-case-builder-v1/HANDOFF.md
- Scorecard: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/03-phase-03-failed-turn-case-builder-v1/SCORECARD.md
- Worksets: docs\implementation\turn-failure-prevention-harness-2026-05-06\execution/03-phase-03-failed-turn-case-builder-v1/WORKSETS.yaml

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
- Generated at: 2026-05-06 13:32:25
