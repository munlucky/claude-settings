# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Taxonomy, Privacy, and Provenance Contract (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/01-taxonomy-privacy-provenance-v1.md

## Goal
- Fill before code changes with the user-visible outcome for this round.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/01-taxonomy-privacy-provenance-v1.md
- Goal:
  - Freeze AWTL/RSME terminology, failure taxonomy, privacy policy, and MemoryGraph provenance boundary before schema/sink implementation.
  - Close the taxonomy-count conflict and the unresolved `RSME` acronym as a documented open decision or ADR.
- Expected outcome:
  - A single contract document and redaction helper skeleton exist before implementation continues.
  - `.claude/traces/` is explicitly treated as ignored artifact storage.
- Scope:
  - Included: AWTL, RSME, event, span, action, memory candidate, promotion definitions; failure taxonomy v1 leaf count decision; fail-closed privacy helper; provenance tag policy; trace ignore policy.
  - Excluded: append-only JSONL sink, phase runner wrapper capture, replay probe execution, and MemoryGraph write implementation.
- Detailed tasks:
  - P01-1: taxonomy and `RSME` terminology confirmation.
  - P01-2: privacy fail-closed helper definition.
  - P01-3: trace ignore policy reflection.
  - P01-4: MemoryGraph provenance boundary documentation.
- Exact execution targets:
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P01-1 | `.claude/scripts/lib/awtl-taxonomy.mjs` | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md` | none | `node --check .claude/scripts/lib/awtl-taxonomy.mjs` | Fail: syntax error. Pass: exit 0 |
| P01-2 | `.claude/scripts/lib/awtl-redaction.mjs`, `.claude/scripts/lib/awtl-redaction.test.mjs` | none | `.claude/scripts/lib/awtl-redaction.test.mjs` | `node --test .claude/scripts/lib/awtl-redaction.test.mjs` | Fail: secret appears in excerpt. Pass: all tests pass |
| P01-3 | none | `.gitignore` | none | `git check-ignore .claude/traces/example/agent_work_trace.jsonl` | Fail: no output. Pass: `.claude/traces/` ignore match output |
| P01-4 | none | `.claude/docs/guidelines/awtl-rsme.md`, `.claude/docs/guidelines/awtl-rsme.ko.md` | none | `bash .claude/scripts/knowledge-repo-audit.sh` | Fail: structural doc audit error. Pass: audit exits 0 |
- Binding rule: these source requirements remain authoritative. Deleting or replacing any item requires user-approved replan before this phase can close.

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
  - `.claude/docs/guidelines/awtl-rsme.md`
  - `.claude/docs/guidelines/awtl-rsme.ko.md`
  - `.claude/scripts/lib/awtl-taxonomy.mjs`
  - `.claude/scripts/lib/awtl-redaction.mjs`
  - `.claude/scripts/lib/awtl-redaction.test.mjs`
  - `.gitignore`
- Interfaces/contracts:
  - AWTL taxonomy exports category, class, and leaf inventories with a bounded leaf count.
  - Redaction helper returns fail-closed shapes for uncertain, dropped, hashed, and allowed values.
  - Guideline docs record privacy boundary, provenance policy, trace ignore policy, and the open RSME decision.

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: open -> act -> mutate -> persist -> recover for secret redaction, provenance boundary, and trace ignore checks.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, stale verification, or unrecorded plan conformance.
- Contract revision required: no
- Review notes: Refreshed for the isolated phase attempt; the evaluator review is complete and verification evidence has been regenerated without widening scope.

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
| AWTL taxonomy export | Test | `node --check .claude/scripts/lib/awtl-taxonomy.mjs` exits 0 |
| Redaction helper | Test | `node --test .claude/scripts/lib/awtl-redaction.test.mjs` exits 0 |
| Trace ignore policy | Workflow | `git check-ignore .claude/traces/example/agent_work_trace.jsonl` prints the ignored path |
| Doc parity | Docs | English and Korean guideline docs record the same boundary decisions |

## Evaluator Focus
- Core flow: taxonomy inventory, fail-closed redaction, trace ignore, provenance boundary.
- Edge cases: secret-like strings in excerpts, uncertain detection, empty leaf inventories, and raw-trace lookup prohibition.
- Stub-only behavior to reject: docs that mention the boundary without encoding it in exports/tests, or tests that only assert happy-path passthrough.

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
- Runtime evidence depth: complete
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-phase-01-taxonomy-privacy-and-provenance-contract-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-phase-01-taxonomy-privacy-and-provenance-contract-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-phase-01-taxonomy-privacy-and-provenance-contract-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/01-phase-01-taxonomy-privacy-and-provenance-contract-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations require a documented replan before clean finish.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally postponed verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally postponed verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: 2026-05-06 02:42:00
