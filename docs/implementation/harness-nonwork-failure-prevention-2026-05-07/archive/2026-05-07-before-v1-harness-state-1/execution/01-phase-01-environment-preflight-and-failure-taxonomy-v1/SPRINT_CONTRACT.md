# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Environment Preflight And Failure Taxonomy (v1)
- Source plan: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/01-environment-preflight-failure-taxonomy-v1.md

## Goal
- Expand the preflight and taxonomy layer so recurring nonwork failures are detected before worker launch.

## Success Criteria
- `failure-classifier` covers the user-listed environment/runtime/storage failures without returning `unknown_failure`.
- `node .claude/scripts/phase-capability-preflight.mjs --json` emits stable blocker and fallback metadata for Codex storage, shell snapshot, MCP cleanup, PATH denial, plugin/network sync noise, Node spawn EPERM, Bash/Git/rg access denied, MemoryGraph unavailable, verifier unavailable, and spawn blocked cases.
- Review, verification, scorecard, and handoff evidence agree before any clean finish claim.

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
- Source phase doc: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/01-environment-preflight-failure-taxonomy-v1.md
- Goal:
  - Expand the preflight and taxonomy layer so recurring nonwork failures are detected before worker launch.
- Expected outcome:
  - `node .claude/scripts/phase-capability-preflight.mjs --json` emits stable current blockers, warning classes, fallback hints, and fingerprints for the listed nonwork failures.
  - `failure-classifier` can classify every user-listed environment/runtime/storage failure without returning `unknown_failure`.
- Scope:
  - Included:
    - Add failure codes for Codex session/storage/state DB readonly, shell snapshot failures, MCP cleanup EPERM, PATH update denied, plugin/network sync failure, Node spawn EPERM, Bash/Git/rg access denied, MemoryGraph unavailable, verifier unavailable, and spawn blocked.
    - Add preflight probes for Node child spawn, Bash smoke, Git index write probe, `rg` path sanity, Codex home/session storage writability, Codex state DB access mode, shell snapshot directory, and MemoryGraph direct health.
    - Preserve existing Docker/package-manager capability behavior.
  - Excluded:
    - Changing worker retry policy.
    - Rewriting phase status, verdict schema, runtime parity, or commit closeout behavior.
- Detailed tasks:
  | ID | Task | Steps | Done Criteria |
  |---|---|---|---|
  | P01-1 | Extend failure taxonomy | Add stable definitions, regex patterns, retry policies, fallback hints, and `isEnvironmentBlockerCode` coverage | Every user-listed nonwork failure class maps to a non-unknown code |
  | P01-2 | Add preflight probes | Add isolated probes that do not mutate tracked files; write temp probe files only under ignored/temp paths | JSON includes `currentBlockers`, `failureClassCounts`, and per-probe details |
  | P01-3 | Add classifier fixtures | Add test cases for Codex permission denied, readonly DB, shell snapshot, MCP cleanup, Node EPERM, Git index denied, MemoryGraph transport closed | `node --test .claude/scripts/lib/failure-classifier.test.mjs` passes |
  | P01-4 | Preserve fallback semantics | Keep `rg` fallback to Select-String on Windows and network fetch as cache/offline fallback | Existing resolver tests remain compatible |
- Exact execution targets:
  | ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
  |---|---|---|---|---|---|
  | P01-1 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | RED before taxonomy additions; GREEN with all nonwork codes covered |
  | P01-2 | none | `.claude/scripts/phase-capability-preflight.mjs` | none | `node .claude/scripts/phase-capability-preflight.mjs --json` | JSON prints `schemaVersion`, `status`, `decision`, `currentBlockers`, `capabilities` |
  | P01-3 | none | `.claude/scripts/lib/failure-classifier.test.mjs` | same | `node --check .claude/scripts/phase-capability-preflight.mjs && node --check .claude/scripts/lib/failure-classifier.mjs` | Exit 0 |
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
- Interfaces/contracts:
  - Extend stable failure codes and blocker metadata for the user-listed nonwork failures.
  - Preserve existing Docker/package-manager capability behavior.

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: run syntax checks, focused classifier unit tests, and runtime preflight smoke; if a verifier is blocked, record structured blocked evidence instead of blind retry.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:
  - Source phase scope stays bounded to `.claude/scripts/lib/failure-classifier.mjs`, `.claude/scripts/lib/failure-classifier.test.mjs`, and `.claude/scripts/phase-capability-preflight.mjs`.
  - This attempt is isolated to AT-01 in WORKSETS.yaml.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 01, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
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
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/01-phase-01-environment-preflight-and-failure-taxonomy-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/01-phase-01-environment-preflight-and-failure-taxonomy-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/01-phase-01-environment-preflight-and-failure-taxonomy-v1/SCORECARD.md
- Worksets: docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/01-phase-01-environment-preflight-and-failure-taxonomy-v1/WORKSETS.yaml

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
- Generated at: 2026-05-07 01:02:19
