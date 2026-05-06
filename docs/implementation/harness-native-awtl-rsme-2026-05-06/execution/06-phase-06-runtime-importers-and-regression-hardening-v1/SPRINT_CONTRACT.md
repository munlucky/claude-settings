# Phase 06 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 6
- Title: Phase 06: Runtime Importers and Regression Hardening (v1)
- Source plan: docs/implementation/harness-native-awtl-rsme-2026-05-06/00-master-plan-v1.md
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/close/06-runtime-importers-regression-hardening-v1.md

## Goal
- Add Codex rollout/session and Claude transcript importers that emit canonical AWTL v1 events with import metadata, while preserving the imported-only promotion blocker regression.

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
- Source phase doc: docs/implementation/harness-native-awtl-rsme-2026-05-06/close/06-runtime-importers-regression-hardening-v1.md
- Goal:
  - Add Codex rollout/session and Claude transcript importers that emit canonical AWTL v1 events with import metadata, while preserving the imported-only promotion blocker regression.
- Expected outcome:
  - importer output includes `source_runtime_schema`, `import_confidence`, `imported_at`
  - importer-created events validate as canonical v1 schema objects
  - imported-only promotion remains blocked
- Scope:
  - Codex importer
  - Claude transcript importer
  - import metadata and confidence handling
  - final regression commands and docs sync
  - `meta-harness-trace` compatibility note
  - Excludes importer-only promotion, direct parsing of private reasoning/full raw prompts, and SQLite WAL storage
- Detailed tasks:
  - P06-1 Codex importer implementation
  - P06-2 Claude transcript importer implementation
  - P06-3 Promotion bypass regression
  - P06-4 Final regression/docs sync
- Exact execution targets:
  - P06-1 | `.claude/scripts/lib/awtl-runtime-importers.mjs`, `.claude/scripts/awtl-import-trace.mjs` | none | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs` | Fail: imported event schema invalid. Pass: schema-valid normalized events
  - P06-2 | none | `.claude/scripts/lib/awtl-runtime-importers.mjs` | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs` | Fail: no import confidence/source schema. Pass: metadata assertions pass
  - P06-3 | none | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `.claude/scripts/lib/awtl-runtime-importers.test.mjs`, `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs` | Fail: imported-only promotion allowed. Pass: blocked
  - P06-4 | none | `.claude/verification.contract.yaml`, `.claude/README.md`, `.claude/README.ko.md`, `README.md`, `.claude/docs/guidelines/awtl-rsme.md` | targeted AWTL tests | `bash .claude/scripts/knowledge-repo-audit.sh` | Fail: docs structure/audit error. Pass: audit exits 0
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or moving any item out of this phase requires user-approved replan before this phase can close.

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
  - `.claude/scripts/lib/awtl-runtime-importers.mjs`
  - `.claude/scripts/lib/awtl-runtime-importers.test.mjs`
  - `.claude/scripts/awtl-import-trace.mjs`
- Interfaces/contracts:
  - `importCodexRolloutSession(input, options)`
  - `importClaudeCodeTranscript(input, options)`
  - `importRuntimeSource(input, options)`
  - imported events must remain schema-valid `awtl.event.v1` objects with metadata in `payload`

## Contract Review
- Contract reviewed by evaluator: yes
- Verification owner: completion-verifier
- Runtime evidence plan: Run importer unit tests, then importer-plus-promotion regression tests, then the phase-required syntax check for the importer CLI. Imported-only candidates must remain blocked.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, stale verification, or any importer output that stops validating against `awtl.event.v1`.
- Contract revision required: no
- Review notes: Source phase target paths were aligned to the active execution artifact set; no blocker override.

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 06, refresh QA/HANDOFF artifacts when state changes, require fresh verification evidence before completion, and keep imported-only promotion blocked.
- Work runtime: codex
- Verification runtime target: codex

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
- QA report: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-phase-06-runtime-importers-and-regression-hardening-v1/QA_REPORT.md
- Handoff: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-phase-06-runtime-importers-and-regression-hardening-v1/HANDOFF.md
- Scorecard: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-phase-06-runtime-importers-and-regression-hardening-v1/SCORECARD.md
- Worksets: docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-phase-06-runtime-importers-and-regression-hardening-v1/WORKSETS.yaml

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run `.claude/scripts/verify-plan-conformance.mjs` before clean finish. Unapproved plan deviations force `retry_loop`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally delayed verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally delayed verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: 2026-05-06 05:24:27
