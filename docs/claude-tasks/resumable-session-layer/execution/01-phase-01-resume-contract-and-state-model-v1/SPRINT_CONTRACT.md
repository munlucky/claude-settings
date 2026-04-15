# Phase 01 Sprint Contract

> Seeded automatically by `agent-loop.mjs`. Refresh before code changes.

## Slice
- Phase: 1
- Title: Phase 01: Resume Contract And State Model (v1)
- Source plan: .claude/docs/tasks/resumable-session-layer/implementation/00-master-plan-v1.md
- Source phase doc: .claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md

## Round Goal
- Freeze the phase-1 resume contract so a future worker can resume from `task_state.json` alone, with explicit identity semantics, state transitions, and task-local status routing.

## Non-Goals
- Define append-only event payload schemas or telemetry fields beyond the snapshot/source-of-truth boundary.
- Implement runtime writers, hooks, or harness integrations that belong to phases 02 and 03.
- Rename identifiers or states that downstream phases are expected to reuse verbatim.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Files/modules:
- `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md`
- `.claude/docs/tasks/resumable-session-layer/work-plan.md`
- `.claude/docs/tasks/resumable-session-layer/implementation/00-master-plan-v1.md`
- `.claude/docs/tasks/resumable-session-layer/phase-status.yaml`
- Interfaces/contracts:
- Resume snapshot contract for `task_state.json`
- Identity model for `task`, `session`, `run`, `event`, and `decision`
- Phase package routing rule for the task-local `phase-status.yaml`

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: .claude/CLAUDE.md
- Verification contract: .claude/verification.contract.yaml
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase 01, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Resume contract frozen | Docs | `task_state.json` required fields, update moments, and source-of-truth rules are explicit and acceptance-ready. |
| Identity/state model frozen | Docs | ids, uniqueness expectations, normal transitions, and exceptional states are defined without term overlap. |
| Task-local routing explicit | Docs | the task-local storage root and explicit `phase-status.yaml` path usage are documented in the phase package. |
| Required verification passed | Verification | repository-required checks from `.claude/verification.contract.yaml` pass and emit a fresh verdict file. |

## Evaluator Focus
- Core flow:
- A future worker can find `resume_from`, `blocked_reason`, and `next_action` from the snapshot contract alone.
- Phase 2 can reuse the identifiers and state names from this phase without renaming or semantic gaps.
- Edge cases:
- `blocked`, `waiting_for_user`, `failed`, `retrying`, and `cancelled` are first-class states with explicit transitions.
- Snapshot mutability versus append-only history is clear enough to avoid dual-source ambiguity.
- Stub-only behavior to reject:
- high-level prose that names the contract without defining required fields or update moments
- task-local routing that depends on global defaults rather than explicit package paths

## Evidence
### Required Verification Commands
- `bash .claude/scripts/knowledge-repo-audit.sh`
- `bash .claude/scripts/verify-code-policy.sh`
- `bash .claude/scripts/workflow-enforcement.sh verify`
- `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
- `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`

### Runtime Flow
- Ready / Isolate: load the active phase doc, sprint contract, workspace contract, and verification contract; checkpoint QA and scorecard immediately.
- Execute: update only the phase-1 task package artifacts needed to freeze the resume contract and task-local routing.
- Review: record semantic review results before finalizing verifier state.
- Verify: run the required contract-backed verification commands and emit a fresh repository-root verdict JSON via `.claude/scripts/write-verification-verdict.py`.
- Finish / Handoff: close only if review evidence, verification evidence, and scorecard all align at `done`.

### Artifacts
- QA report: .claude/docs/tasks/resumable-session-layer/execution/01-phase-01-resume-contract-and-state-model-v1/QA_REPORT.md
- Handoff: .claude/docs/tasks/resumable-session-layer/execution/01-phase-01-resume-contract-and-state-model-v1/HANDOFF.md
- Scorecard: .claude/docs/tasks/resumable-session-layer/execution/01-phase-01-resume-contract-and-state-model-v1/SCORECARD.md

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: 100

## Risks
- Known uncertainty: phase 1 is documentation-first, so completion depends on contract precision rather than executable feature behavior.
- Rollback or safe fallback: keep changes bounded to the resumable-session-layer task package and preserve downstream phase naming compatibility.

## Notes
- Generated at: 2026-04-09 05:40:22
