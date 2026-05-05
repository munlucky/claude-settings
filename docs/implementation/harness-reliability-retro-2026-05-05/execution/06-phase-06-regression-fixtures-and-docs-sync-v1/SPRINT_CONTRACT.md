# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Regression Fixtures and Docs Sync (v1)
- Source plan: docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\06-regression-fixtures-and-doc-sync-v1.md

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
- Source phase doc: docs\implementation\harness-reliability-retro-2026-05-05\06-regression-fixtures-and-doc-sync-v1.md
- Goal:
  - Phase 01-05에서 구현한 정책을 replay-lens 장기 실행 이슈에 대응하는 regression fixture로 고정한다.
  - 하네스 개선 범위와 downstream product phase 범위를 문서에서 분리한다.
  - docs/guidelines와 verification contract가 새 capability/fallback/artifact/timing 정책을 설명하게 한다.
- Expected outcome:
  - bash unavailable, git EPERM, pnpm equivalent, Docker daemon missing, parity fixture mutation, blocked QA, SCN evidence format fixture가 모두 존재한다.
  - `knowledge-repo-audit`와 Node/Python syntax checks로 docs/scripts drift를 잡는다.
  - ignored evidence include policy가 closeout 절차에 명시된다.
- Scope:
  - regression fixture matrix
  - docs/guidelines sync
  - Windows path handling audit
  - evidence include policy
  - final audit partial-mode decision note
- Detailed tasks:
  - P06-1 regression fixture suite 작성: 7개 fixture 작성, 각 fixture expected decision 명시, scripts self-test에 연결
  - P06-2 docs/guidelines sync: long-running harness, codex fallback, verification contract, meta-harness trace 업데이트
  - P06-3 Windows path and evidence policy audit: `new URL(import.meta.url).pathname` 검색, ignored evidence include policy 문서화, audit result 기록
  - P06-4 final audit partial-mode decision: Docker 같은 external blocker에서 final audit partial-mode 허용 조건 검토, fake pass 금지 조건 기록
- Exact execution targets:
  - P06-1 | fixture files under `.claude/scripts/` test scope | existing test entrypoints | `.claude/scripts/*test*.mjs` | `node .claude/scripts/lib/failure-classifier.test.mjs && node .claude/scripts/lib/command-resolver.test.mjs && node .claude/scripts/artifact-normalizer.test.mjs` | all self-tests passed
  - P06-2 | 없음 | `.claude/docs/guidelines/long-running-harness.md`, `.claude/docs/guidelines/meta-harness-trace.md`, `.claude/docs/guidelines/verification-contract.md`, `.claude/docs/guidelines/codex-fallback.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | audit pass or environment blocker classified
  - P06-3 | docs note in this plan dir | `.claude/verification.contract.yaml` | path audit fixture | `Select-String -Path .claude\scripts\*.mjs -Pattern "new URL\(import.meta.url\)\.pathname"` | no unsafe occurrences or documented exception
  - P06-4 | decision note in `CURRENT_FINDINGS.md` or follow-up doc | `.claude/docs/guidelines/verification-contract.md` | docs audit | `node --check .claude/scripts/verify-phase-closeout.mjs` | exit code 0
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
  - `.claude/scripts/lib/verification-contract.mjs`
  - `.claude/scripts/lib/command-resolver.test.mjs`
  - `.claude/scripts/lib/verification-contract.test.mjs`
  - `.claude/docs/guidelines/long-running-harness.md`
  - `.claude/docs/guidelines/meta-harness-trace.md`
  - `.claude/docs/guidelines/verification-contract.md`
  - `.claude/docs/guidelines/codex-fallback.md`
  - `.claude/verification.contract.yaml`
  - `docs/implementation/harness-reliability-retro-2026-05-05/CURRENT_FINDINGS.md`
- Interfaces/contracts:
  - regression fixture suite must execute pnpm-equivalent, Docker-missing, blocked-QA, SCN evidence, and Windows path regression coverage
  - final audit policy must distinguish external blockers from fake-pass clean finish claims
  - documentation must explain ignored evidence include policy and blocker-aware partial-mode closeout

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
  - phase 06 work is bounded to regression fixtures, docs sync, and path-handling hardening; no downstream product phase changes
  - `new URL(import.meta.url).pathname` needs a Windows-safe regression fixture before clean finish can be claimed
  - Host closeout verified the path regression fixture, docs audit, code policy, runtime parity, boundary, and worktree checks.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 06, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-reliability-retro-2026-05-05/execution/06-phase-06-regression-fixtures-and-docs-sync-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-reliability-retro-2026-05-05/execution/06-phase-06-regression-fixtures-and-docs-sync-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-reliability-retro-2026-05-05/execution/06-phase-06-regression-fixtures-and-docs-sync-v1/SCORECARD.md
- Worksets: docs/implementation/harness-reliability-retro-2026-05-05/execution/06-phase-06-regression-fixtures-and-docs-sync-v1/WORKSETS.yaml

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
- Generated at: 2026-05-05 10:27:50
